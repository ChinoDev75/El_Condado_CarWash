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
    const bookingDuration = booking.service?.durationMinutes || 60;

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
      ? Booking.find(visibleBookingsFilter).populate('user', 'name email').populate('service', 'title price category durationMinutes')
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
    const financials = buildBookingFinancials(service, paymentMethod);
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
      service: serviceId,
      date: bookingDate,
      time,
      plate: cleanPlate,
      washMode,
      status: requiresCheckout ? 'awaiting_payment' : 'confirmed',
      paymentStatus: 'unpaid',
      paymentMethod,
      ...financials,
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
      service: serviceId,
      date: bookingDate,
      time,
      plate: cleanPlate,
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
    const activeMemberships = bookings.filter((booking) => booking.membershipPlan !== 'none' && booking.status !== 'cancelled').length;
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
    await booking.populate('user', 'name email');
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
    await booking.populate('user', 'name email');
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
    await booking.populate('user', 'name email');

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
    await booking.populate('user', 'name email');
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

    if (booking.status === 'completed' && booking.user && booking.paymentStatus === 'paid' && !booking.pointsAwarded) {
      const points = calculateLoyaltyPoints(booking);
      if (points > 0) {
        await User.findByIdAndUpdate(booking.user, { $inc: { loyalty_points: points } });
      }
      booking.pointsAwarded = true;
      booking.loyaltyPointsAwarded = points;
    }

    await booking.save();
    await booking.populate('user', 'name email');
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
