const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const { createRecurrenteCheckout } = require('../utils/recurrente');
const { expireUnpaidBookings } = require('../utils/bookingExpiry');
const {
  BOOKING_EXPIRATION_MINUTES,
  PAYMENT_METHODS,
  calculatePaymentAmounts,
  getBookingExpiration
} = require('../utils/payments');
const {
  addDaysUtc,
  findNextAvailableDate,
  getAvailabilityForService,
  intervalsOverlap,
  isSlotAvailable,
  parseTimeToMinutes
} = require('../utils/scheduler');
const {
  getBusinessDateKey,
  getDateKeyFromStoredDate,
  parseDateKeyToUtcDate
} = require('../utils/dateTime');
const { canClientChangeBooking } = require('../utils/bookingPolicy');
const {
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
  isValidObjectId,
  parseBookingDate,
  parseServicePriceCents,
  isValidBookingTime,
  getWashMode,
  normalizeEmail,
  sanitizePlate,
  sanitizeString,
  getPlateIssues,
  isValidPlate
} = require('../utils/validation');
const { calculateLoyaltyPoints } = require('../utils/loyaltyPoints');
const {
  REFERRAL_REWARD_POINTS,
  awardReferralReward,
  buildReferralDiscount,
  findValidReferrer,
  normalizeReferralCode
} = require('../utils/referrals');
const { auditLog } = require('../utils/auditLogger');

const userCanAccessBooking = (req, booking) => (
  req.user.role === 'admin' || (booking.user && booking.user.toString() === req.user.id)
);

const validateClientChangePolicy = (req, booking) => {
  if (req.user.role === 'admin') return { allowed: true };
  return canClientChangeBooking(booking);
};

const hasSameBookingConflict = ({ booking, visitId, date, time, durationMinutes }) => {
  const dateKey = getDateKeyFromStoredDate(date);
  const startMinutes = parseTimeToMinutes(time);
  if (!dateKey || startMinutes === null) return true;

  const endMinutes = startMinutes + durationMinutes;

  if (['awaiting_payment', 'pending', 'confirmed'].includes(booking.status) && getDateKeyFromStoredDate(booking.date) === dateKey) {
    const bookingStart = parseTimeToMinutes(booking.time);
    const bookingDuration = booking.customMembership?.firstVisitDurationMinutes || booking.service?.durationMinutes || 60;

    if (
      bookingStart !== null &&
      intervalsOverlap(startMinutes, endMinutes, bookingStart, bookingStart + bookingDuration)
    ) {
      return true;
    }
  }

  return (booking.membershipSchedule || []).some((visit) => {
    if (
      String(visit._id) === String(visitId) ||
      visit.status !== 'scheduled' ||
      getDateKeyFromStoredDate(visit.date) !== dateKey
    ) {
      return false;
    }

    const visitStart = parseTimeToMinutes(visit.time);
    const visitDuration = visit.durationMinutes || 60;
    return visitStart !== null && intervalsOverlap(startMinutes, endMinutes, visitStart, visitStart + visitDuration);
  });
};

exports.getBookings = async (req, res) => {
  try {
    await expireUnpaidBookings();

    const visibleBookingsFilter = { status: { $ne: 'awaiting_payment' } };
    const query = req.user.role === 'admin'
      ? Booking.find(visibleBookingsFilter).populate('user', 'name email phone address').populate('service', 'title price category durationMinutes')
      : Booking.find({ ...visibleBookingsFilter, user: req.user.id }).populate('service', 'title price category durationMinutes');

    const bookings = await query.sort('-createdAt');
    return res.status(200).json(bookings);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error del servidor' });
  }
};

const getMembershipPlan = (service) => {
  if (service.category !== 'membresia') return null;
  return service.isTrimestral || /trimestral/i.test(service.title) ? 'quarterly' : 'monthly';
};

const getMembershipVisits = (plan) => {
  if (plan === 'monthly') {
    return [
      { offsetDays: 15, title: 'Lavado exterior de membresia', durationMinutes: 30 },
      { offsetDays: 30, title: 'Lavado completo de cierre mensual', durationMinutes: 60 }
    ];
  }

  if (plan === 'quarterly') {
    return [
      { offsetDays: 15, title: 'Lavado exterior de membresia', durationMinutes: 30 },
      { offsetDays: 30, title: 'Lavado completo mes 1', durationMinutes: 60 },
      { offsetDays: 45, title: 'Lavado exterior mes 2', durationMinutes: 30 },
      { offsetDays: 60, title: 'Lavado completo mes 2', durationMinutes: 60 },
      { offsetDays: 75, title: 'Lavado exterior mes 3', durationMinutes: 30 },
      { offsetDays: 90, title: 'Lavado completo final trimestral', durationMinutes: 60 }
    ];
  }

  return [];
};

const generateMembershipSchedule = async ({ service, startDate, time, excludeBookingId = null }) => {
  const plan = getMembershipPlan(service);
  if (!plan) return { plan: 'none', visits: [] };

  const plannedVisits = [];

  for (const visit of getMembershipVisits(plan)) {
    let preferredDate = addDaysUtc(startDate, visit.offsetDays);
    let scheduledDate = null;

    for (let attempt = 0; attempt < 4 && !scheduledDate; attempt += 1) {
      const candidate = await findNextAvailableDate({
        preferredDate,
        time,
        durationMinutes: visit.durationMinutes,
        maxDays: 14,
        excludeBookingId
      });

      if (!candidate) {
        break;
      }

      const conflictsWithPlanned = plannedVisits.some((planned) => (
        planned.date.toISOString().slice(0, 10) === candidate.toISOString().slice(0, 10) &&
        planned.time === time
      ));

      if (!conflictsWithPlanned) {
        scheduledDate = candidate;
      } else {
        preferredDate = addDaysUtc(candidate, 1);
      }
    }

    if (!scheduledDate) {
      throw new Error('No hay disponibilidad suficiente para crear el cronograma completo de la membresia.');
    }

    plannedVisits.push({
      date: scheduledDate,
      time,
      title: visit.title,
      durationMinutes: visit.durationMinutes,
      status: 'scheduled'
    });
  }

  return { plan, visits: plannedVisits };
};

const getPaymentMethod = (value) => (
  PAYMENT_METHODS.has(value) ? value : 'card'
);

const getValidatedWashMode = (value) => getWashMode(value);

const validateBookingBasics = async ({ serviceId, date, time, plate }) => {
  const bookingDate = parseBookingDate(date);
  const cleanPlate = sanitizePlate(plate);
  const plateIssues = getPlateIssues(plate);

  if (!isValidObjectId(serviceId) || !bookingDate || !isValidBookingTime(time)) {
    return { error: 'Datos de reserva invalidos' };
  }

  if (!isValidPlate(plate)) {
    return { error: `Placa invalida: ${plateIssues[0]}`, statusCode: 400 };
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    return { error: 'Servicio no encontrado', statusCode: 404 };
  }

  const availability = await getAvailabilityForService({ serviceId, date: bookingDate });
  const selectedSlot = availability.slots.find((slot) => slot.time === time);

  if (!selectedSlot) {
    return { error: 'Ese horario no esta dentro de tu horario disponible.' };
  }

  if (!selectedSlot.available) {
    return { error: 'Ese horario ya esta reservado. Elige otra hora.', statusCode: 409 };
  }

  return { bookingDate, cleanPlate, service };
};

const buildBookingFinancials = (service, paymentMethod) => {
  const subtotalCents = parseServicePriceCents(service.price);
  if (!subtotalCents) {
    throw new Error('El servicio no tiene un precio valido.');
  }

  return calculatePaymentAmounts(subtotalCents, paymentMethod);
};

const customCarTierLabels = {
  individual: 'Individual',
  duo: 'Duo',
  trio: 'Trio',
  four_plus: '4+ carros'
};

const getCustomCarCount = (tier, requestedCount) => {
  if (tier === 'individual') return 1;
  if (tier === 'duo') return 2;
  if (tier === 'trio') return 3;
  if (tier === 'four_plus') {
    const count = Number(requestedCount);
    return Number.isInteger(count) && count >= 4 && count <= 12 ? count : null;
  }

  return null;
};

const normalizeVehiclePlates = (plates, carCount) => {
  if (!Array.isArray(plates) || plates.length !== carCount) {
    return { error: `Agrega exactamente ${carCount} placa(s).` };
  }

  const invalidPlate = plates.find((plate) => !isValidPlate(plate));
  if (invalidPlate) {
    const issues = getPlateIssues(invalidPlate);
    return { error: `Placa invalida (${invalidPlate || 'sin placa'}): ${issues[0]}` };
  }

  const normalized = plates.map((plate) => sanitizePlate(plate));
  if (new Set(normalized).size !== normalized.length) {
    return { error: 'No repitas placas dentro de la misma membresia.' };
  }

  return { plates: normalized };
};

const CUSTOM_MEMBERSHIP_SERVICE_CATEGORIES = new Set(['lavado', 'promo', 'extra']);

const roundToWholeQuetzalCents = (cents) => Math.max(0, Math.round((Number(cents) || 0) / 100) * 100);

const getCustomMembershipDiscountRate = (grossSubtotalCents) => {
  if (grossSubtotalCents >= 40000) return 0.20;
  if (grossSubtotalCents >= 30000) return 0.18;
  if (grossSubtotalCents >= 22500) return 0.15;
  if (grossSubtotalCents >= 15000) return 0.12;
  return 0.10;
};

const buildCustomMembershipFinancials = (grossSubtotalCents, paymentMethod) => {
  const originalSubtotalCents = roundToWholeQuetzalCents(grossSubtotalCents);
  const discountRate = getCustomMembershipDiscountRate(originalSubtotalCents);
  const discountCents = roundToWholeQuetzalCents(originalSubtotalCents * discountRate);
  const discountedSubtotalCents = roundToWholeQuetzalCents(originalSubtotalCents - discountCents);
  const amounts = calculatePaymentAmounts(discountedSubtotalCents, paymentMethod);
  const paymentFeeCents = roundToWholeQuetzalCents(amounts.paymentFeeCents);

  return {
    originalSubtotalCents,
    discountRatePercent: Math.round(discountRate * 100),
    discountCents,
    subtotalCents: discountedSubtotalCents,
    paymentFeeCents,
    totalCents: roundToWholeQuetzalCents(discountedSubtotalCents + paymentFeeCents)
  };
};

const applyReferralDiscount = async ({ financials, paymentMethod, referralCode, buyerUserId }) => {
  const cleanCode = normalizeReferralCode(referralCode);
  if (!cleanCode) {
    return { financials, referral: undefined };
  }

  const referralResult = await findValidReferrer(cleanCode, buyerUserId);
  if (referralResult.error) {
    return { error: referralResult.error };
  }

  const { discountCents, discountRatePercent } = buildReferralDiscount(financials.subtotalCents);
  const discountedSubtotalCents = roundToWholeQuetzalCents(financials.subtotalCents - discountCents);
  const paymentAmounts = calculatePaymentAmounts(discountedSubtotalCents, paymentMethod);
  const paymentFeeCents = paymentMethod === 'card'
    ? roundToWholeQuetzalCents(paymentAmounts.paymentFeeCents)
    : 0;

  return {
    financials: {
      ...financials,
      subtotalCents: discountedSubtotalCents,
      paymentFeeCents,
      totalCents: roundToWholeQuetzalCents(discountedSubtotalCents + paymentFeeCents)
    },
    referral: {
      code: referralResult.referralCode,
      referrer: referralResult.referrer._id,
      discountRatePercent,
      discountCents,
      rewardPoints: REFERRAL_REWARD_POINTS
    }
  };
};

const getSelectedVisitPlates = (itemPlates, allVehiclePlates) => {
  if (!Array.isArray(itemPlates) || itemPlates.length === 0) {
    return allVehiclePlates;
  }

  const selected = itemPlates.map((plate) => sanitizePlate(plate));
  if (selected.some((plate) => !allVehiclePlates.includes(plate))) {
    return null;
  }

  return [...new Set(selected)];
};

const summarizeCustomServices = (visits) => {
  const summary = new Map();

  visits.forEach((visit) => {
    const key = String(visit.service._id);
    const current = summary.get(key) || {
      service: visit.service._id,
      title: visit.service.title,
      category: visit.service.category,
      visits: 0,
      carWashes: 0,
      subtotalCents: 0
    };

    current.visits += 1;
    current.carWashes += visit.vehiclePlates.length;
    current.subtotalCents += visit.subtotalCents;
    summary.set(key, current);
  });

  return [...summary.values()];
};

const buildCustomSchedule = async ({ schedule, washCount, serviceMap, defaultService, allVehiclePlates }) => {
  if (!Array.isArray(schedule) || schedule.length !== washCount) {
    return { error: `Agenda exactamente ${washCount} lavado(s).` };
  }

  const visits = [];
  for (let index = 0; index < schedule.length; index += 1) {
    const item = schedule[index];
    const serviceId = String(item.serviceId || item.washServiceId || defaultService?._id || '');
    const service = serviceMap.get(serviceId);
    const date = parseBookingDate(item.date);
    const time = item.time;
    const selectedPlates = getSelectedVisitPlates(item.vehiclePlates, allVehiclePlates);

    if (!service) {
      return { error: `Selecciona un servicio valido para el lavado ${index + 1}.` };
    }

    if (!CUSTOM_MEMBERSHIP_SERVICE_CATEGORIES.has(service.category)) {
      return { error: `El servicio ${service.title} no se puede usar dentro de una membresia personalizada.` };
    }

    if (!date || !isValidBookingTime(time)) {
      return { error: 'Una de las fechas u horas de la membresia es invalida.' };
    }

    if (!selectedPlates || selectedPlates.length === 0) {
      return { error: `Selecciona al menos un carro para el lavado ${index + 1}.` };
    }

    const priceCents = parseServicePriceCents(service.price);
    if (!priceCents) {
      return { error: `El servicio ${service.title} no tiene precio valido.` };
    }

    const durationMinutes = (service.durationMinutes || 60) * selectedPlates.length;
    if (durationMinutes > 480) {
      return { error: `El lavado ${index + 1} dura demasiado para una sola visita. Reduce carros o cambia servicio.` };
    }

    visits.push({
      date,
      dateKey: getDateKeyFromStoredDate(date),
      time,
      startMinutes: parseTimeToMinutes(time),
      service,
      vehiclePlates: selectedPlates,
      durationMinutes,
      priceCents,
      subtotalCents: priceCents * selectedPlates.length,
      order: index + 1
    });
  }

  for (let i = 0; i < visits.length; i += 1) {
    const visit = visits[i];

    for (let j = i + 1; j < visits.length; j += 1) {
      const other = visits[j];
      if (
        visit.dateKey === other.dateKey &&
        intervalsOverlap(
          visit.startMinutes,
          visit.startMinutes + visit.durationMinutes,
          other.startMinutes,
          other.startMinutes + other.durationMinutes
        )
      ) {
        return { error: 'Dos lavados de la membresia chocan entre si. Cambia fecha u hora.' };
      }
    }

    const available = await isSlotAvailable({
      date: visit.date,
      time: visit.time,
      durationMinutes: visit.durationMinutes
    });

    if (!available) {
      return { error: `No hay disponibilidad para ${visit.dateKey} a las ${visit.time}.` };
    }
  }

  return { visits };
};

exports.createBooking = async (req, res) => {
  let booking;

  try {
    await expireUnpaidBookings();

    const { serviceId, time } = req.body;
    const validation = await validateBookingBasics({
      serviceId,
      date: req.body.date,
      time,
      plate: req.body.plate
    });

    if (validation.error) {
      return res.status(validation.statusCode || 400).json({ message: validation.error });
    }

    const { bookingDate, cleanPlate, service } = validation;
    const paymentMethod = getPaymentMethod(req.body.paymentMethod);
    const washMode = getValidatedWashMode(req.body.washMode);
    if (!washMode) {
      return res.status(400).json({ message: 'Selecciona como se realizara el lavado.' });
    }
    const referralResult = await applyReferralDiscount({
      financials: buildBookingFinancials(service, paymentMethod),
      paymentMethod,
      referralCode: req.body.referralCode,
      buyerUserId: req.user.id
    });
    if (referralResult.error) {
      return res.status(400).json({ message: referralResult.error });
    }

    const financials = referralResult.financials;
    const membership = await generateMembershipSchedule({
      service,
      startDate: bookingDate,
      time
    });
    const requiresCheckout = paymentMethod === 'card';

    booking = await Booking.create({
      user: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phone || '',
      customerAddress: req.user.address || '',
      service: serviceId,
      date: bookingDate,
      time,
      plate: cleanPlate,
      vehiclePlates: [cleanPlate],
      washMode,
      status: requiresCheckout ? 'awaiting_payment' : 'confirmed',
      paymentStatus: 'unpaid',
      paymentMethod,
      ...financials,
      referral: referralResult.referral,
      expiresAt: requiresCheckout ? getBookingExpiration() : null,
      membershipPlan: membership.plan,
      membershipSchedule: membership.visits
    });

    let checkoutUrl = null;
    if (requiresCheckout) {
      try {
        const recurrenteData = await createRecurrenteCheckout(req.user, {
          title: `${service.title} (incluye comision tarjeta)`,
          price: service.price,
          amountInCents: booking.totalCents,
          bookingId: booking._id.toString()
        });

        checkoutUrl = recurrenteData.checkout_url;
        booking.recurrenteCheckoutId = recurrenteData.id;
        await booking.save();
      } catch (err) {
        console.error('Error critico al generar checkout:', err.message);
        await Booking.findByIdAndDelete(booking._id);
        return res.status(502).json({
          success: false,
          message: 'No se pudo generar el enlace de pago seguro. Por favor intenta de nuevo.'
        });
      }
    }

    auditLog('booking.created', {
      userId: req.user.id,
      bookingId: booking._id,
      serviceId,
      date: booking.date,
      time,
      paymentMethod,
      washMode
    });

    return res.status(201).json({
      success: true,
      booking,
      checkoutUrl,
      expiresInMinutes: requiresCheckout ? BOOKING_EXPIRATION_MINUTES : null
    });
  } catch (error) {
    console.error(error);

    if (error.code === 11000) {
      return res.status(409).json({ message: 'Ese horario ya esta reservado. Elige otra hora.' });
    }

    return res.status(400).json({ message: error.message || 'Error al crear la reserva' });
  }
};

exports.createCustomMembership = async (req, res) => {
  let booking;

  try {
    await expireUnpaidBookings();

    const requestedSchedule = Array.isArray(req.body.schedule) ? req.body.schedule : [];
    const washCount = requestedSchedule.length || Number(req.body.washCount);
    const carTier = sanitizeString(req.body.carTier, 20);
    const carCount = getCustomCarCount(carTier, req.body.carCount);
    const paymentMethod = getPaymentMethod(req.body.paymentMethod);
    const washMode = getValidatedWashMode(req.body.washMode);
    const planName = sanitizeString(req.body.planName, 120) || 'Membresia personalizada';

    if (!Number.isInteger(washCount) || washCount < 1 || washCount > 24) {
      return res.status(400).json({ message: 'Elige entre 1 y 24 lavados para la membresia.' });
    }

    if (!carCount) {
      return res.status(400).json({ message: 'Selecciona si la membresia es individual, duo, trio o 4+ carros.' });
    }

    if (!washMode) {
      return res.status(400).json({ message: 'Selecciona como se realizaran los lavados.' });
    }

    const plateResult = normalizeVehiclePlates(req.body.vehiclePlates, carCount);
    if (plateResult.error) {
      return res.status(400).json({ message: plateResult.error });
    }

    const requestedServiceIds = [
      req.body.washServiceId,
      req.body.serviceId,
      ...requestedSchedule.map((visit) => visit.serviceId || visit.washServiceId)
    ].filter((serviceId) => isValidObjectId(serviceId));
    const services = await Service.find({ _id: { $in: requestedServiceIds } });
    const serviceMap = new Map(services.map((service) => [String(service._id), service]));
    const defaultService = serviceMap.get(String(req.body.washServiceId || req.body.serviceId || '')) || services[0];

    if (!defaultService && requestedSchedule.some((visit) => !visit.serviceId && !visit.washServiceId)) {
      return res.status(400).json({ message: 'Selecciona al menos un servicio para organizar la membresia.' });
    }

    const scheduleResult = await buildCustomSchedule({
      schedule: requestedSchedule,
      washCount,
      serviceMap,
      defaultService,
      allVehiclePlates: plateResult.plates
    });

    if (scheduleResult.error) {
      return res.status(409).json({ message: scheduleResult.error });
    }

    const originalSubtotalCents = scheduleResult.visits.reduce((sum, visit) => sum + visit.subtotalCents, 0);
    const membershipFinancials = buildCustomMembershipFinancials(originalSubtotalCents, paymentMethod);
    const referralResult = await applyReferralDiscount({
      financials: membershipFinancials,
      paymentMethod,
      referralCode: req.body.referralCode,
      buyerUserId: req.user.id
    });
    if (referralResult.error) {
      return res.status(400).json({ message: referralResult.error });
    }

    const financials = referralResult.financials;
    const requiresCheckout = paymentMethod === 'card';
    const [firstVisit, ...remainingVisits] = scheduleResult.visits;
    const vehiclePlates = plateResult.plates;
    const titlePrefix = `${planName} - ${customCarTierLabels[carTier] || `${carCount} carros`}`;
    const serviceBreakdown = summarizeCustomServices(scheduleResult.visits);

    booking = await Booking.create({
      user: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phone || '',
      customerAddress: req.user.address || '',
      service: firstVisit.service._id,
      date: firstVisit.date,
      time: firstVisit.time,
      plate: firstVisit.vehiclePlates[0],
      vehiclePlates: firstVisit.vehiclePlates,
      washMode,
      status: requiresCheckout ? 'awaiting_payment' : 'confirmed',
      paymentStatus: 'unpaid',
      paymentMethod,
      ...financials,
      referral: referralResult.referral,
      expiresAt: requiresCheckout ? getBookingExpiration() : null,
      membershipPlan: 'custom',
      customMembership: {
        planName: titlePrefix,
        washCount,
        originalSubtotalCents: membershipFinancials.originalSubtotalCents,
        discountRatePercent: membershipFinancials.discountRatePercent,
        discountCents: membershipFinancials.discountCents,
        discountedSubtotalCents: membershipFinancials.subtotalCents,
        carTier,
        carCount,
        washServiceTitle: serviceBreakdown.map((item) => item.title).join(', ').slice(0, 120),
        firstVisitServiceTitle: firstVisit.service.title,
        firstVisitDurationMinutes: firstVisit.durationMinutes,
        firstVisitSubtotalCents: firstVisit.subtotalCents,
        pricePerCarWashCents: 0,
        durationPerVisitMinutes: Math.max(...scheduleResult.visits.map((visit) => visit.durationMinutes)),
        serviceBreakdown
      },
      membershipSchedule: remainingVisits.map((visit, index) => ({
        date: visit.date,
        time: visit.time,
        title: `Lavado ${index + 2}/${washCount}: ${visit.service.title}`,
        service: visit.service._id,
        serviceTitle: visit.service.title,
        serviceCategory: visit.service.category,
        subtotalCents: visit.subtotalCents,
        durationMinutes: visit.durationMinutes,
        vehiclePlates: visit.vehiclePlates,
        status: 'scheduled'
      })),
      internalNotes: sanitizeString(req.body.internalNotes, 500)
    });

    let checkoutUrl = null;
    if (requiresCheckout) {
      try {
        const recurrenteData = await createRecurrenteCheckout(req.user, {
          title: `${titlePrefix} (${washCount} visitas organizadas, incluye comision tarjeta)`,
          price: `Q${(financials.totalCents / 100).toFixed(2)}`,
          amountInCents: booking.totalCents,
          bookingId: booking._id.toString()
        });

        checkoutUrl = recurrenteData.checkout_url;
        booking.recurrenteCheckoutId = recurrenteData.id;
        await booking.save();
      } catch (err) {
        console.error('Error critico al generar checkout de membresia:', err.message);
        await Booking.findByIdAndDelete(booking._id);
        return res.status(502).json({
          success: false,
          message: 'No se pudo generar el enlace de pago seguro. Por favor intenta de nuevo.'
        });
      }
    }

    await booking.populate('service', 'title price category durationMinutes');

    auditLog('membership.custom_created', {
      userId: req.user.id,
      bookingId: booking._id,
      washCount,
      carCount,
      serviceCount: serviceBreakdown.length,
      paymentMethod
    });

    return res.status(201).json({
      success: true,
      booking,
      checkoutUrl,
      expiresInMinutes: requiresCheckout ? BOOKING_EXPIRATION_MINUTES : null
    });
  } catch (error) {
    console.error(error);

    if (booking?._id && error.code === 11000) {
      await Booking.findByIdAndDelete(booking._id);
    }

    if (error.code === 11000) {
      return res.status(409).json({ message: 'Uno de los horarios ya esta reservado. Elige otro.' });
    }

    return res.status(400).json({ message: error.message || 'Error al crear la membresia personalizada' });
  }
};

exports.createAdminBooking = async (req, res) => {
  try {
    await expireUnpaidBookings();

    const { serviceId, time } = req.body;
    const validation = await validateBookingBasics({
      serviceId,
      date: req.body.date,
      time,
      plate: req.body.plate
    });

    if (validation.error) {
      return res.status(validation.statusCode || 400).json({ message: validation.error });
    }

    const { bookingDate, cleanPlate, service } = validation;
    const customerName = sanitizeString(req.body.customerName, 100);
    const customerPhone = sanitizeString(req.body.customerPhone, 30);
    const customerEmail = normalizeEmail(req.body.customerEmail);
    const customerAddress = sanitizeString(req.body.customerAddress, 220);
    const washMode = getValidatedWashMode(req.body.washMode);

    if (!customerName || !customerPhone) {
      return res.status(400).json({ message: 'Nombre y telefono del cliente son obligatorios' });
    }

    if (!washMode) {
      return res.status(400).json({ message: 'Selecciona como se realizara el lavado.' });
    }

    const paymentMethod = getPaymentMethod(req.body.paymentMethod);
    const paymentStatus = req.body.paymentStatus === 'paid' ? 'paid' : 'unpaid';
    const financials = buildBookingFinancials(service, paymentMethod);
    const membership = await generateMembershipSchedule({
      service,
      startDate: bookingDate,
      time
    });

    const booking = await Booking.create({
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      service: serviceId,
      date: bookingDate,
      time,
      plate: cleanPlate,
      vehiclePlates: [cleanPlate],
      washMode,
      status: paymentStatus === 'paid' ? 'confirmed' : 'pending',
      paymentStatus,
      paymentMethod,
      source: 'admin',
      paidAt: paymentStatus === 'paid' ? new Date() : null,
      expiresAt: null,
      ...financials,
      membershipPlan: membership.plan,
      membershipSchedule: membership.visits,
      internalNotes: sanitizeString(req.body.internalNotes, 500)
    });

    await booking.populate('service', 'title price category durationMinutes');

    auditLog('booking.admin_created', {
      adminId: req.user.id,
      bookingId: booking._id,
      serviceId,
      paymentMethod,
      paymentStatus,
      washMode
    });

    return res.status(201).json({ success: true, booking });
  } catch (error) {
    console.error(error);

    if (error.code === 11000) {
      return res.status(409).json({ message: 'Ese horario ya esta reservado. Elige otra hora.' });
    }

    return res.status(400).json({ message: error.message || 'Error al crear la reserva manual' });
  }
};

exports.getBookingMetrics = async (req, res) => {
  try {
    await expireUnpaidBookings();

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const today = parseDateKeyToUtcDate(getBusinessDateKey(now));

    const [bookings, todayCount, monthBookings] = await Promise.all([
      Booking.find({ status: { $ne: 'awaiting_payment' } }).populate('service', 'title price category durationMinutes'),
      Booking.countDocuments({ date: today, status: { $in: ['pending', 'confirmed'] } }),
      Booking.find({
        status: { $ne: 'awaiting_payment' },
        createdAt: { $gte: startOfMonth, $lt: startOfNextMonth }
      }).populate('service', 'title price category')
    ]);

    const paidMonthBookings = monthBookings.filter((booking) => booking.paymentStatus === 'paid');
    const revenueCents = paidMonthBookings.reduce((sum, booking) => sum + (booking.totalCents || 0), 0);
    const pendingPaymentsCents = bookings
      .filter((booking) => booking.paymentStatus !== 'paid' && booking.status !== 'cancelled')
      .reduce((sum, booking) => sum + (booking.totalCents || 0), 0);
    const activeMemberships = bookings.filter((booking) => booking.membershipPlan && booking.membershipPlan !== 'none' && booking.status !== 'cancelled').length;
    const upcomingLimit = new Date(today);
    upcomingLimit.setUTCDate(upcomingLimit.getUTCDate() + 7);
    const upcomingWeekCount = bookings.filter((booking) => (
      ['pending', 'confirmed'].includes(booking.status) &&
      booking.date >= today &&
      booking.date < upcomingLimit
    )).length;
    const unpaidCount = bookings.filter((booking) => (
      booking.paymentStatus !== 'paid' &&
      booking.status !== 'cancelled'
    )).length;
    const cancelledMonthCount = monthBookings.filter((booking) => booking.status === 'cancelled').length;
    const completedMonthCount = monthBookings.filter((booking) => booking.status === 'completed').length;
    const failedPaymentCount = bookings.filter((booking) => booking.paymentStatus === 'failed').length;
    const paymentMethodTotals = ['card', 'cash', 'transfer'].map((method) => {
      const methodBookings = paidMonthBookings.filter((booking) => booking.paymentMethod === method);
      return {
        method,
        count: methodBookings.length,
        revenueCents: methodBookings.reduce((sum, booking) => sum + (booking.totalCents || 0), 0)
      };
    });
    const membershipVisitSummary = bookings.reduce((summary, booking) => {
      (booking.membershipSchedule || []).forEach((visit) => {
        summary.total += 1;
        if (visit.status === 'completed') summary.completed += 1;
        if (visit.status === 'scheduled') summary.remaining += 1;
      });
      return summary;
    }, { total: 0, completed: 0, remaining: 0 });
    const serviceCounts = new Map();
    const hourCounts = new Map();

    bookings.forEach((booking) => {
      const serviceTitle = booking.service?.title || 'Servicio eliminado';
      serviceCounts.set(serviceTitle, (serviceCounts.get(serviceTitle) || 0) + 1);
      hourCounts.set(booking.time, (hourCounts.get(booking.time) || 0) + 1);
    });

    const topServices = [...serviceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }));
    const peakHours = [...hourCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([time, count]) => ({ time, count }));

    return res.status(200).json({
      todayCount,
      monthBookings: monthBookings.length,
      revenueCents,
      pendingPaymentsCents,
      activeMemberships,
      unpaidCount,
      failedPaymentCount,
      cancelledMonthCount,
      completedMonthCount,
      upcomingWeekCount,
      paymentMethodTotals,
      membershipVisitSummary,
      topServices,
      peakHours,
      monthLabel: now.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' })
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al calcular metricas' });
  }
};

exports.rescheduleBooking = async (req, res) => {
  try {
    await expireUnpaidBookings();

    const { date, time } = req.body;
    const bookingDate = parseBookingDate(date);

    if (!isValidObjectId(req.params.id) || !bookingDate || !isValidBookingTime(time)) {
      return res.status(400).json({ message: 'Fecha, hora o reserva invalida' });
    }

    const booking = await Booking.findById(req.params.id).populate('service', 'title price category durationMinutes');
    if (!booking) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    if (!userCanAccessBooking(req, booking)) {
      return res.status(403).json({ message: 'No autorizado para modificar esta reserva' });
    }

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ message: 'Solo se pueden reprogramar reservas activas.' });
    }

    const policy = validateClientChangePolicy(req, booking);
    if (!policy.allowed) {
      return res.status(403).json({ message: policy.reason });
    }

    if (!booking.service) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    const availability = await getAvailabilityForService({
      serviceId: booking.service._id,
      date: bookingDate,
      excludeBookingId: booking._id
    });
    const selectedSlot = availability.slots.find((slot) => slot.time === time);

    if (!selectedSlot) {
      return res.status(400).json({ message: 'Ese horario no esta dentro de tu horario disponible.' });
    }

    if (!selectedSlot.available) {
      return res.status(409).json({ message: 'Ese horario ya esta reservado. Elige otra hora.' });
    }

    const hasCompletedMembershipVisits = (booking.membershipSchedule || []).some((visit) => visit.status === 'completed');
    if (booking.service.category === 'membresia' && hasCompletedMembershipVisits) {
      return res.status(400).json({ message: 'Esta membresia ya tiene lavados completados y no puede reprogramarse completa.' });
    }

    if (booking.service.category === 'membresia') {
      const membership = await generateMembershipSchedule({
        service: booking.service,
        startDate: bookingDate,
        time,
        excludeBookingId: booking._id
      });
      booking.membershipPlan = membership.plan;
      booking.membershipSchedule = membership.visits;
    }

    booking.date = bookingDate;
    booking.time = time;
    await booking.save();
    await booking.populate('user', 'name email phone address');
    await booking.populate('service', 'title price category durationMinutes');

    auditLog('booking.rescheduled', {
      actorId: req.user.id,
      bookingId: booking._id,
      date: booking.date,
      time
    });

    return res.status(200).json(booking);
  } catch (error) {
    console.error(error);

    if (error.code === 11000) {
      return res.status(409).json({ message: 'Ese horario ya esta reservado. Elige otra hora.' });
    }

    return res.status(400).json({ message: error.message || 'Error al reprogramar reserva' });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    await expireUnpaidBookings();

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Reserva invalida' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    if (!userCanAccessBooking(req, booking)) {
      return res.status(403).json({ message: 'No autorizado para cancelar esta reserva' });
    }

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ message: 'Solo se pueden cancelar reservas activas.' });
    }

    const policy = validateClientChangePolicy(req, booking);
    if (!policy.allowed) {
      return res.status(403).json({ message: policy.reason });
    }

    booking.status = 'cancelled';
    booking.expiresAt = null;
    booking.membershipSchedule.forEach((visit) => {
      if (visit.status === 'scheduled') {
        visit.status = 'cancelled';
      }
    });
    await booking.save();
    await booking.populate('user', 'name email phone address');
    await booking.populate('service', 'title price category durationMinutes');

    auditLog('booking.cancelled', {
      actorId: req.user.id,
      bookingId: booking._id
    });

    return res.status(200).json(booking);
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: 'Error al cancelar reserva' });
  }
};

exports.rescheduleMembershipVisit = async (req, res) => {
  try {
    await expireUnpaidBookings();

    const { bookingId, visitId } = req.params;
    const { time } = req.body;

    if (!isValidObjectId(bookingId) || !isValidObjectId(visitId) || !isValidBookingTime(time)) {
      return res.status(400).json({ message: 'Hora o visita de membresia invalida' });
    }

    const booking = await Booking.findById(bookingId)
      .populate('service', 'title price category durationMinutes');

    if (!booking) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    if (!userCanAccessBooking(req, booking)) {
      return res.status(403).json({ message: 'No autorizado para modificar esta membresia' });
    }

    if (!['pending', 'confirmed', 'completed'].includes(booking.status)) {
      return res.status(400).json({ message: 'Solo se pueden modificar membresias activas.' });
    }

    if (booking.service?.category !== 'membresia' && booking.membershipPlan === 'none') {
      return res.status(400).json({ message: 'Esta reserva no es una membresia.' });
    }

    const visit = booking.membershipSchedule.id(visitId);
    if (!visit) {
      return res.status(404).json({ message: 'Visita de membresia no encontrada' });
    }

    if (visit.status !== 'scheduled') {
      return res.status(400).json({ message: 'Solo se puede cambiar la hora de lavados pendientes.' });
    }

    const policy = validateClientChangePolicy(req, {
      user: booking.user,
      status: 'confirmed',
      date: visit.date,
      time: visit.time
    });

    if (!policy.allowed) {
      return res.status(403).json({ message: policy.reason });
    }

    const durationMinutes = visit.durationMinutes || 60;
    const available = await isSlotAvailable({
      date: visit.date,
      time,
      durationMinutes,
      excludeBookingId: booking._id
    });

    if (!available) {
      return res.status(409).json({ message: 'Ese horario no esta disponible para este lavado de membresia.' });
    }

    if (hasSameBookingConflict({ booking, visitId, date: visit.date, time, durationMinutes })) {
      return res.status(409).json({ message: 'Ese horario choca con otro lavado de esta misma membresia.' });
    }

    visit.time = time;
    await booking.save();
    await booking.populate('service', 'title price category durationMinutes');
    await booking.populate('user', 'name email phone address');

    auditLog('membership.visit_rescheduled', {
      actorId: req.user.id,
      bookingId,
      visitId,
      date: visit.date,
      time
    });

    return res.status(200).json(booking);
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: error.message || 'Error al cambiar la hora del lavado de membresia' });
  }
};

exports.completeMembershipVisit = async (req, res) => {
  try {
    const { bookingId, visitId } = req.params;

    if (!isValidObjectId(bookingId) || !isValidObjectId(visitId)) {
      return res.status(400).json({ message: 'Identificador invalido' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    const visit = booking.membershipSchedule.id(visitId);
    if (!visit) {
      return res.status(404).json({ message: 'Visita de membresia no encontrada' });
    }

    visit.status = 'completed';
    await booking.save();
    await booking.populate('user', 'name email phone address');
    await booking.populate('service', 'title price category durationMinutes');

    auditLog('membership.visit_completed', {
      adminId: req.user.id,
      bookingId,
      visitId
    });

    return res.status(200).json(booking);
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: 'Error al completar visita de membresia' });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;
    const hasStatusUpdate = Object.prototype.hasOwnProperty.call(req.body, 'status');
    const hasPaymentUpdate = Object.prototype.hasOwnProperty.call(req.body, 'paymentStatus');

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Reserva invalida' });
    }

    if (!hasStatusUpdate && !hasPaymentUpdate) {
      return res.status(400).json({ message: 'No hay cambios para aplicar' });
    }

    if (hasStatusUpdate && !BOOKING_STATUSES.has(status)) {
      return res.status(400).json({ message: 'Estado o reserva invalida' });
    }

    if (hasPaymentUpdate && !PAYMENT_STATUSES.has(paymentStatus)) {
      return res.status(400).json({ message: 'Estado de pago invalido' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    if (hasStatusUpdate) {
      booking.status = status;
    }

    if (hasPaymentUpdate) {
      booking.paymentStatus = paymentStatus;
      booking.paidAt = paymentStatus === 'paid' ? (booking.paidAt || new Date()) : null;

      if (paymentStatus === 'paid' && ['awaiting_payment', 'pending'].includes(booking.status)) {
        booking.status = 'confirmed';
        booking.expiresAt = null;
      }
    }

    if (booking.paymentStatus === 'paid') {
      await awardReferralReward(booking);
    }

    if (booking.status === 'completed' && booking.user && booking.paymentStatus === 'paid' && !booking.pointsAwarded) {
      const points = calculateLoyaltyPoints(booking);
      if (points > 0) {
        await User.findByIdAndUpdate(booking.user, { $inc: { loyalty_points: points } });
      }
      booking.pointsAwarded = true;
      booking.loyaltyPointsAwarded = points;
    }

    await booking.save();
    await booking.populate('user', 'name email phone address');
    await booking.populate('service', 'title price');

    auditLog('booking.status_updated', {
      adminId: req.user.id,
      bookingId: booking._id,
      status: hasStatusUpdate ? booking.status : undefined,
      paymentStatus: hasPaymentUpdate ? booking.paymentStatus : undefined
    });

    return res.status(200).json(booking);
  } catch (error) {
    return res.status(400).json({ message: 'Error al actualizar reserva' });
  }
};
