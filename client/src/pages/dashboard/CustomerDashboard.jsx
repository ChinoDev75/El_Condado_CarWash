import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { IconCar, IconStar, IconCalendar, IconCheck } from '../../components/Icons';
import { goldBtn, ghostBtn } from '../../styles/buttonStyles';
import { apiFetch } from '../../lib/api';
import AlertCard from '../../components/AlertCard';
import Modal from '../../components/Modal';
import { inputStyle } from '../../styles/formStyles';
import {
  buildBusinessDateTime,
  compareBusinessDateTime,
  formatDisplayDate,
  toDateKey
} from '../../lib/dateUtils';

const formatDate = (value, options = {}) => (
  formatDisplayDate(value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...options
  })
);

const washModeLabels = {
  at_home: "A domicilio",
  drop_off: "Llegar a dejar",
  pickup_and_return: "Ir a recoger"
};

const getWashModeLabel = (value) => washModeLabels[value] || "Sin definir";

const isMembershipBooking = (booking) => (
  (booking.membershipPlan && booking.membershipPlan !== 'none') ||
  booking.service?.category === 'membresia'
);

const getBookingTitle = (booking) => booking.customMembership?.planName || booking.service?.title || 'Servicio';

const getVehicleLabel = (booking) => (
  Array.isArray(booking.vehiclePlates) && booking.vehiclePlates.length > 0
    ? booking.vehiclePlates.join(', ')
    : booking.plate
);

const buildCustomerEvents = (bookings) => {
  const events = [];

  bookings.forEach((booking) => {
    events.push({
      id: `${booking._id}-main`,
      bookingId: booking._id,
      serviceId: booking.service?._id || booking.service,
      booking,
      date: booking.date,
      time: booking.time,
      title: getBookingTitle(booking),
      plate: getVehicleLabel(booking),
      washMode: booking.washMode,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      type: isMembershipBooking(booking) ? 'membresia' : 'reserva',
      isMembershipVisit: false
    });

    (booking.status === 'cancelled' ? [] : (booking.membershipSchedule || []))
      .filter((visit) => visit.status !== 'cancelled')
      .forEach((visit) => {
        events.push({
          id: `${booking._id}-${visit._id || visit.date}`,
          bookingId: booking._id,
          visitId: visit._id,
          serviceId: booking.service?._id || booking.service,
          booking,
          date: visit.date,
          time: visit.time,
          title: visit.title || booking.service?.title || 'Lavado de membresia',
          plate: getVehicleLabel(booking),
          washMode: booking.washMode,
          status: visit.status,
          paymentStatus: booking.paymentStatus,
          paymentMethod: booking.paymentMethod,
          type: 'membresia',
          isMembershipVisit: true
        });
      });
  });

  return events.sort(compareBusinessDateTime);
};

const paymentLabel = (booking) => {
  if (booking.paymentStatus === 'paid') return 'Pagado';
  if (booking.paymentStatus === 'failed') return 'Pago fallido';
  if (booking.paymentMethod === 'cash') return 'Pago en efectivo';
  if (booking.paymentMethod === 'transfer') return 'Transferencia pendiente';
  return 'Pago pendiente';
};

const paymentColor = (booking) => {
  if (booking.paymentStatus === 'paid') return '#25D366';
  if (booking.paymentStatus === 'failed') return '#f87171';
  return '#D4AF37';
};

const statusLabel = (booking) => {
  if (booking.paymentStatus !== 'paid') return paymentLabel(booking);
  if (booking.status === 'confirmed') return 'Confirmado';
  if (booking.status === 'completed') return 'Completado';
  if (booking.status === 'cancelled') return 'Cancelado';
  return 'Pendiente';
};

const CLIENT_CHANGE_NOTICE_HOURS = 24;

const buildAppointmentDateTime = (booking) => {
  return buildBusinessDateTime(booking.date, booking.time);
};

const canChangeBooking = (booking) => {
  if (!['pending', 'confirmed'].includes(booking.status)) {
    return { allowed: false, reason: 'Esta cita ya no se puede modificar.' };
  }

  const appointmentAt = buildAppointmentDateTime(booking);
  if (!appointmentAt) {
    return { allowed: false, reason: 'No se pudo validar el horario de esta cita.' };
  }

  const hoursUntil = (appointmentAt.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntil < CLIENT_CHANGE_NOTICE_HOURS) {
    return { allowed: false, reason: `Cambios disponibles hasta ${CLIENT_CHANGE_NOTICE_HOURS} horas antes.` };
  }

  return { allowed: true };
};

const canChangeMembershipVisit = (event) => {
  if (!event?.isMembershipVisit || event.status !== 'scheduled') {
    return { allowed: false, reason: 'Solo puedes cambiar la hora de lavados pendientes de membresia.' };
  }

  return canChangeBooking({
    status: 'confirmed',
    date: event.date,
    time: event.time
  });
};

const eventStatusLabel = (event) => {
  if (event.isMembershipVisit) {
    if (event.status === 'completed') return 'Lavado completado';
    if (event.status === 'cancelled') return 'Lavado cancelado';
    return 'Lavado programado';
  }

  return statusLabel(event);
};

const getMembershipUsage = (booking) => {
  const visits = booking.membershipSchedule || [];
  const initialCompleted = booking.status === 'completed' ? 1 : 0;
  const initialRemaining = ['pending', 'confirmed'].includes(booking.status) ? 1 : 0;
  const completed = initialCompleted + visits.filter((visit) => visit.status === 'completed').length;
  const remaining = initialRemaining + visits.filter((visit) => visit.status === 'scheduled').length;

  return {
    total: 1 + visits.length,
    completed,
    remaining
  };
};

const parseBookingSubtotalCents = (booking) => (
  booking.subtotalCents || booking.totalCents || 0
);

const formatQuetzalesRate = (value) => {
  const amount = Number(value) || 0;
  return Number.isInteger(amount) ? amount : amount.toFixed(2);
};

const calculateBookingPoints = (booking, pointsRateQuetzales = 3) => {
  const rateCents = Math.max(1, Math.round(pointsRateQuetzales * 100));
  const baseCents = parseBookingSubtotalCents(booking);
  if (!baseCents) return 0;
  return Math.max(1, Math.floor(baseCents / rateCents));
};

export default function CustomerDashboard() {
  const { user, token, logout } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [points, setPoints] = useState(0);
  const [loyaltyInfo, setLoyaltyInfo] = useState({
    pointsRateQuetzales: 3,
    reviewBonusPoints: 10,
    referralDiscountPercent: 5,
    referralRewardPoints: 20,
    redemptionBlockPoints: 100,
    redemptionDiscountQuetzales: 20,
    referralCode: ''
  });
  const [loading, setLoading] = useState(true);
  const [alertCard, setAlertCard] = useState({ open: false });
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({
    bookingId: '',
    visitId: '',
    serviceId: '',
    serviceTitle: '',
    originalDate: '',
    date: '',
    time: ''
  });
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [dashboardNow] = useState(() => new Date());

  const closeAlertCard = () => setAlertCard((prev) => ({ ...prev, open: false }));

  const showAlert = ({ type = 'info', title, message }) => {
    setAlertCard({
      open: true,
      type,
      title,
      message,
      confirmLabel: 'Aceptar',
      onConfirm: closeAlertCard
    });
  };

  const showConfirm = ({ title, message, confirmLabel = 'Confirmar', onConfirm }) => {
    setAlertCard({
      open: true,
      type: 'warning',
      title,
      message,
      confirmLabel,
      cancelLabel: 'Cancelar',
      onCancel: closeAlertCard,
      onConfirm: async () => {
        closeAlertCard();
        await onConfirm();
      }
    });
  };

  const fetchData = useCallback(async () => {
    try {
      const [bookingsResult, pointsResult] = await Promise.allSettled([
        apiFetch('/bookings', { token }),
        apiFetch('/loyalty/me', { token })
      ]);

      if (bookingsResult.status === 'fulfilled') {
        setBookings(Array.isArray(bookingsResult.value) ? bookingsResult.value : []);
      } else {
        console.error(bookingsResult.reason);
      }

      if (pointsResult.status === 'fulfilled') {
        const pointsData = pointsResult.value;
        setPoints(pointsData.points || 0);
        setLoyaltyInfo({
          pointsRateQuetzales: pointsData.pointsRateQuetzales || 3,
          reviewBonusPoints: pointsData.reviewBonusPoints || 10,
          referralDiscountPercent: pointsData.referralDiscountPercent || 5,
          referralRewardPoints: pointsData.referralRewardPoints || 20,
          redemptionBlockPoints: pointsData.redemptionBlockPoints || 100,
          redemptionDiscountQuetzales: pointsData.redemptionDiscountQuetzales || 20,
          referralCode: pointsData.referralCode || user?.referralCode || ''
        });
      } else {
        console.error(pointsResult.reason);
        setLoyaltyInfo((prev) => ({
          ...prev,
          referralCode: prev.referralCode || user?.referralCode || ''
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, user?.referralCode]);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        fetchData();
      }
    });

    return () => {
      active = false;
    };
  }, [fetchData]);

  const verifyPayment = async (bookingId) => {
    try {
      const data = await apiFetch(`/payments/verify/${bookingId}`, { token });
      if (data.status === 'paid') {
        showAlert({ type: 'success', title: 'Pago verificado', message: 'Tu reserva quedo confirmada.' });
        fetchData();
      } else {
        showAlert({ type: 'info', title: 'Pago en proceso', message: data.message });
      }
    } catch (err) {
      console.error(err);
      showAlert({ type: 'error', title: 'No se pudo verificar el pago', message: err.message || 'Error al conectar con el servidor' });
    }
  };

  const openRescheduleBooking = (item) => {
    const event = item?.event || item;
    const policy = canChangeMembershipVisit(event);
    if (!policy.allowed) {
      showAlert({ type: 'info', title: 'Cambio no disponible', message: policy.reason });
      return;
    }

    const dateKey = toDateKey(event.date);
    setRescheduleForm({
      bookingId: event.bookingId,
      visitId: event.visitId,
      serviceId: event.serviceId,
      serviceTitle: event.title || 'Lavado de membresia',
      originalDate: dateKey,
      date: dateKey,
      time: event.time
    });
    setRescheduleSlots([]);
    setRescheduleModalOpen(true);
  };

  const handleRescheduleChange = (event) => {
    const { name, value } = event.target;
    setRescheduleForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'date' ? { time: '' } : {})
    }));
  };

  useEffect(() => {
    let active = true;

    queueMicrotask(async () => {
      if (!rescheduleModalOpen || !rescheduleForm.serviceId || !rescheduleForm.date) {
        setRescheduleSlots([]);
        return;
      }

      setRescheduleSlotsLoading(true);
      try {
        const availability = await apiFetch(`/settings/availability?serviceId=${encodeURIComponent(rescheduleForm.serviceId)}&date=${encodeURIComponent(rescheduleForm.date)}`);
        if (active) {
          let slots = Array.isArray(availability.slots) ? availability.slots.filter((slot) => slot.available) : [];
          const shouldKeepCurrentSlot = rescheduleForm.originalDate === rescheduleForm.date && rescheduleForm.time;
          if (shouldKeepCurrentSlot && !slots.some((slot) => slot.time === rescheduleForm.time)) {
            slots = [{ time: rescheduleForm.time }, ...slots].sort((a, b) => a.time.localeCompare(b.time));
          }
          setRescheduleSlots(slots);
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setRescheduleSlots([]);
        }
      } finally {
        if (active) {
          setRescheduleSlotsLoading(false);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [rescheduleForm.date, rescheduleForm.originalDate, rescheduleForm.serviceId, rescheduleForm.time, rescheduleModalOpen]);

  const saveRescheduleBooking = async (event) => {
    event.preventDefault();

    try {
      const endpoint = rescheduleForm.visitId
        ? `/bookings/${rescheduleForm.bookingId}/membership-visits/${rescheduleForm.visitId}/reschedule`
        : `/bookings/${rescheduleForm.bookingId}/reschedule`;
      const payload = rescheduleForm.visitId
        ? { time: rescheduleForm.time }
        : { date: rescheduleForm.date, time: rescheduleForm.time };

      await apiFetch(endpoint, {
        method: 'PUT',
        token,
        body: JSON.stringify(payload)
      });
      setRescheduleModalOpen(false);
      fetchData();
      showAlert({ type: 'success', title: 'Horario actualizado', message: 'La nueva hora de tu lavado quedo guardada.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo reprogramar', message: err.message || 'Elige otro horario disponible.' });
    }
  };

  const cancelBooking = (booking) => {
    const policy = canChangeBooking(booking);
    if (!policy.allowed) {
      showAlert({ type: 'info', title: 'Cancelacion no disponible', message: policy.reason });
      return;
    }

    showConfirm({
      title: 'Cancelar cita',
      message: `Seguro que quieres cancelar ${booking.service?.title || 'esta cita'}? El horario quedara disponible para otros clientes.`,
      confirmLabel: 'Cancelar cita',
      onConfirm: async () => {
        try {
          await apiFetch(`/bookings/${booking._id}/cancel`, {
            method: 'PUT',
            token
          });
          fetchData();
          showAlert({ type: 'success', title: 'Cita cancelada', message: 'Tu cita fue cancelada correctamente.' });
        } catch (err) {
          showAlert({ type: 'error', title: 'No se pudo cancelar', message: err.message || 'Intenta de nuevo.' });
        }
      }
    });
  };

  const activeBookings = useMemo(() => (
    bookings.filter((booking) => booking.status === 'pending' || booking.status === 'confirmed')
  ), [bookings]);

  const membershipBookings = useMemo(() => (
    bookings.filter((booking) => booking.status !== 'cancelled' && isMembershipBooking(booking) && booking.membershipSchedule?.length > 0)
  ), [bookings]);

  const upcomingEvents = useMemo(() => (
    buildCustomerEvents(bookings)
      .filter((event) => {
        if (!['pending', 'confirmed', 'scheduled'].includes(event.status)) return false;
        const appointmentAt = buildBusinessDateTime(event.date, event.time);
        return appointmentAt && appointmentAt.getTime() >= dashboardNow.getTime();
      })
  ), [bookings, dashboardNow]);

  const calendarPreviewEvents = useMemo(() => upcomingEvents.slice(0, 8), [upcomingEvents]);

  const upcomingDashboardItems = useMemo(() => upcomingEvents.map((event) => ({
    _id: event.id,
    bookingId: event.bookingId,
    visitId: event.visitId,
    event,
    isMembershipVisit: event.isMembershipVisit,
    service: {
      _id: event.serviceId,
      title: event.title,
      category: event.type
    },
    date: event.date,
    time: event.time,
    plate: event.plate,
    washMode: event.washMode,
    status: event.isMembershipVisit ? 'confirmed' : event.status,
    paymentStatus: event.paymentStatus,
    paymentMethod: event.paymentMethod,
    pointsAwarded: event.booking?.pointsAwarded,
    loyaltyPointsAwarded: event.booking?.loyaltyPointsAwarded,
    subtotalCents: event.booking?.subtotalCents,
    totalCents: event.booking?.totalCents
  })), [upcomingEvents]);

  const notifications = useMemo(() => {
    const items = [];
    const failedPayment = activeBookings.find((booking) => booking.paymentStatus === 'failed');
    const transferPending = activeBookings.find((booking) => booking.paymentMethod === 'transfer' && booking.paymentStatus !== 'paid');
    const nextEvent = upcomingEvents[0];
    const membershipWithPendingVisits = membershipBookings.find((booking) => getMembershipUsage(booking).remaining > 0);

    if (failedPayment) {
      items.push({
        title: 'Pago fallido',
        message: `${failedPayment.service?.title || 'Tu reserva'} necesita revision de pago.`
      });
    }

    if (transferPending) {
      items.push({
        title: 'Transferencia pendiente',
        message: 'Envia tu comprobante para que el admin confirme tu pago.'
      });
    }

    if (nextEvent) {
      items.push({
        title: 'Proxima visita',
        message: `${formatDate(nextEvent.date)} a las ${nextEvent.time} para ${nextEvent.title}.`
      });
    }

    if (membershipWithPendingVisits) {
      const usage = getMembershipUsage(membershipWithPendingVisits);
      items.push({
        title: 'Membresia activa',
        message: `Te quedan ${usage.remaining} lavados programados en ${getBookingTitle(membershipWithPendingVisits)}.`
      });
    }

    if (items.length === 0) {
      items.push({
        title: 'Todo al dia',
        message: 'No tienes pagos o citas pendientes por revisar.'
      });
    }

    return items.slice(0, 4);
  }, [activeBookings, membershipBookings, upcomingEvents]);

  const pointsToEarn = (booking) => calculateBookingPoints(booking, loyaltyInfo.pointsRateQuetzales);
  const referralCode = loyaltyInfo.referralCode || user?.referralCode || '';
  const pointsBundleSpend = formatQuetzalesRate((loyaltyInfo.pointsRateQuetzales || 3) * 10);

  const openReferralWhatsApp = (code, discountPercent) => {
    const message = `Te comparto mi codigo de El Condado CarWash: ${code}. Usalo al comprar y recibes ${discountPercent}% de descuento.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const shareReferralCode = async () => {
    if (referralCode) {
      openReferralWhatsApp(referralCode, loyaltyInfo.referralDiscountPercent);
      return;
    }

    if (!token) {
      showAlert({ type: 'info', title: 'Inicia sesion', message: 'Necesitas iniciar sesion para usar tu codigo personal.' });
      return;
    }

    try {
      const pointsData = await apiFetch('/loyalty/me', { token });
      const nextCode = pointsData.referralCode || '';
      const nextDiscountPercent = pointsData.referralDiscountPercent || 5;

      setLoyaltyInfo((prev) => ({
        ...prev,
        pointsRateQuetzales: pointsData.pointsRateQuetzales || prev.pointsRateQuetzales,
        reviewBonusPoints: pointsData.reviewBonusPoints || prev.reviewBonusPoints,
        referralDiscountPercent: nextDiscountPercent,
        referralRewardPoints: pointsData.referralRewardPoints || prev.referralRewardPoints,
        redemptionBlockPoints: pointsData.redemptionBlockPoints || prev.redemptionBlockPoints,
        redemptionDiscountQuetzales: pointsData.redemptionDiscountQuetzales || prev.redemptionDiscountQuetzales,
        referralCode: nextCode
      }));

      if (!nextCode) {
        showAlert({ type: 'info', title: 'Codigo no disponible', message: 'No se pudo generar tu codigo todavia. Intenta de nuevo en un momento.' });
        return;
      }

      openReferralWhatsApp(nextCode, nextDiscountPercent);
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo cargar tu codigo', message: err.message || 'Intenta de nuevo en un momento.' });
    }
  };

  if (loading) {
    return <div style={{ color: '#fff', textAlign: 'center', padding: '100px' }}>Cargando tu experiencia premium...</div>;
  }

  return (
    <div className="customer-dashboard" style={{ minHeight: '100vh', background: '#05070a', color: '#e5e7eb', padding: '100px 2rem 50px' }}>
      <AlertCard
        open={alertCard.open}
        type={alertCard.type}
        title={alertCard.title}
        message={alertCard.message}
        confirmLabel={alertCard.confirmLabel}
        cancelLabel={alertCard.cancelLabel}
        onConfirm={alertCard.onConfirm}
        onCancel={alertCard.onCancel}
        onClose={closeAlertCard}
      />
      <Modal
        open={rescheduleModalOpen}
        onClose={() => setRescheduleModalOpen(false)}
        title="Cambiar hora de membresia"
      >
        <form onSubmit={saveRescheduleBooking} style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1rem' }}>
            <p style={{ margin: 0, color: '#D4AF37', fontWeight: 900 }}>{rescheduleForm.serviceTitle}</p>
            <p style={{ margin: '4px 0 0', color: '#a0aec0', fontSize: '0.88rem' }}>Puedes cambiar solo la hora hasta 24 horas antes del lavado.</p>
          </div>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Fecha</label>
              <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: '#e5e7eb' }}>
                {formatDisplayDate(rescheduleForm.date)}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Nueva hora</label>
              <select
                name="time"
                value={rescheduleForm.time}
                onChange={handleRescheduleChange}
                style={inputStyle}
                required
                disabled={rescheduleSlotsLoading || rescheduleSlots.length === 0}
              >
                <option value="">{rescheduleSlotsLoading ? 'Cargando...' : 'Selecciona'}</option>
                {rescheduleSlots.map((slot) => (
                  <option key={slot.time} value={slot.time}>{slot.time}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setRescheduleModalOpen(false)} style={ghostBtn}>Cerrar</button>
            <button type="submit" style={goldBtn}>Guardar cambio</button>
          </div>
        </form>
      </Modal>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div className="glass-panel" style={{ padding: '3rem', borderRadius: '32px', marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', gap: '2rem', alignItems: 'center', background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(0,0,0,0.4))', border: '1px solid rgba(212,175,55,0.2)', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '3.5rem', marginBottom: '0.5rem', lineHeight: 1 }}>
              Bienvenido, <span className="gold-text">{user?.name?.split(' ')[0]}</span>
            </h1>
            <p style={{ color: '#a0aec0', fontSize: '1.1rem' }}>Tus reservas, membresias y puntos en un solo lugar.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 20px', borderRadius: '18px', border: '1px solid rgba(212,175,55,0.3)' }}>
              <p style={{ fontSize: '0.7rem', color: '#D4AF37', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '0.4rem' }}>Puntos</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <IconStar />
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#D4AF37' }}>{points}</span>
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 20px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: '0.7rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '0.4rem' }}>Proximos</p>
              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>{upcomingEvents.length}</span>
            </div>
          </div>
        </div>

        <div className="customer-dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <IconCalendar /> Proximas Citas
              </h2>

              <div style={{ display: 'grid', gap: '1rem' }}>
                {upcomingDashboardItems.length > 0 ? upcomingDashboardItems.map((booking) => (
                  <div key={booking._id} className="booking-list-item" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', alignItems: 'center', padding: '1.35rem', background: 'rgba(255,255,255,0.02)', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ width: '54px', height: '54px', borderRadius: '14px', background: 'rgba(212,175,55,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4AF37' }}>
                        <IconCar />
                      </div>
                      <div>
                        <p style={{ fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>{booking.service?.title}</p>
                        <p style={{ color: '#718096', fontSize: '0.88rem', margin: '4px 0' }}>
                          {formatDate(booking.date)} · {booking.time} · Placa {booking.plate}
                        </p>
                        <p style={{ color: '#718096', fontSize: '0.78rem', margin: '0 0 4px' }}>
                          {getWashModeLabel(booking.washMode)}
                        </p>
                        {booking.isMembershipVisit && (
                          <span style={{ color: '#D4AF37', fontSize: '0.75rem', fontWeight: 800 }}>Lavado de membresia programado</span>
                        )}
                        {booking.paymentStatus === 'paid' && !booking.pointsAwarded && (
                          <p style={{ color: '#a0aec0', fontSize: '0.75rem', margin: '4px 0 0' }}>
                            Al completarse ganas {pointsToEarn(booking)} pts.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="booking-list-actions" style={{ textAlign: 'right', display: 'grid', gap: '8px' }}>
                      <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', padding: '5px 12px', borderRadius: '50px', background: booking.paymentStatus === 'paid' ? '#25D36622' : '#D4AF3722', color: paymentColor(booking), fontWeight: 900 }}>
                        {booking.isMembershipVisit ? eventStatusLabel(booking.event) : statusLabel(booking)}
                      </span>
                      {!booking.isMembershipVisit && booking.paymentStatus === 'unpaid' && booking.paymentMethod === 'card' && (
                        <button
                          type="button"
                          onClick={() => verifyPayment(booking.bookingId || booking._id)}
                          style={{ ...ghostBtn, padding: '7px 12px', fontSize: '0.72rem' }}
                        >
                          Verificar Pago
                        </button>
                      )}
                      {booking.isMembershipVisit && canChangeMembershipVisit(booking.event).allowed ? (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => openRescheduleBooking(booking)}
                            style={{ ...ghostBtn, padding: '7px 12px', fontSize: '0.72rem' }}
                          >
                            Cambiar hora
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelBooking(booking)}
                            style={{ ...ghostBtn, display: 'none', padding: '7px 12px', fontSize: '0.72rem', color: '#f87171', borderColor: 'rgba(248,113,113,0.25)' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <p style={{ color: '#718096', fontSize: '0.72rem', margin: 0, display: booking.isMembershipVisit ? 'block' : 'none' }}>
                          {booking.isMembershipVisit ? canChangeMembershipVisit(booking.event).reason : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <p style={{ color: '#4a5568' }}>No tienes citas activas en este momento.</p>
                    <button type="button" onClick={() => window.location.href = '/#servicios'} style={{ ...goldBtn, marginTop: '1rem', padding: '10px 24px' }}>Explorar Servicios</button>
                  </div>
                )}
              </div>
            </div>

            {membershipBookings.length > 0 && (
              <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Mis Membresias</h2>
                <div style={{ display: 'grid', gap: '1.5rem' }}>
                  {membershipBookings.map((booking) => {
                    const usage = getMembershipUsage(booking);

                    return (
                    <div key={booking._id} style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.16)', borderRadius: '18px', padding: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ color: '#D4AF37', fontWeight: 900, margin: 0 }}>{getBookingTitle(booking)}</p>
                          <p style={{ color: '#718096', fontSize: '0.85rem', margin: '4px 0 0' }}>Inicio: {formatDate(booking.date)} a las {booking.time}</p>
                          <p style={{ color: '#718096', fontSize: '0.78rem', margin: '4px 0 0' }}>{getWashModeLabel(booking.washMode)}</p>
                          {booking.customMembership?.washCount > 0 && (
                            <p style={{ color: '#25D366', fontSize: '0.78rem', margin: '4px 0 0' }}>
                              {booking.customMembership.washCount} lavados - {booking.customMembership.carCount} carro(s) - {getVehicleLabel(booking)}
                            </p>
                          )}
                          {(booking.customMembership?.serviceBreakdown || []).length > 0 && (
                            <p style={{ color: '#718096', fontSize: '0.76rem', margin: '4px 0 0' }}>
                              {booking.customMembership.serviceBreakdown.map((item) => `${item.title} (${item.carWashes})`).join(' · ')}
                            </p>
                          )}
                        </div>
                        <span style={{ color: paymentColor(booking), fontWeight: 800, fontSize: '0.8rem' }}>
                          {booking.paymentStatus === 'paid' ? 'Activa' : paymentLabel(booking)}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '8px' }}>
                          <div style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                            <p style={{ color: '#718096', fontSize: '0.68rem', textTransform: 'uppercase', margin: 0 }}>Total</p>
                            <strong style={{ color: '#fff' }}>{usage.total}</strong>
                          </div>
                          <div style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                            <p style={{ color: '#718096', fontSize: '0.68rem', textTransform: 'uppercase', margin: 0 }}>Hechos</p>
                            <strong style={{ color: '#25D366' }}>{usage.completed}</strong>
                          </div>
                          <div style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                            <p style={{ color: '#718096', fontSize: '0.68rem', textTransform: 'uppercase', margin: 0 }}>Restan</p>
                            <strong style={{ color: '#D4AF37' }}>{usage.remaining}</strong>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: '10px', alignItems: 'center', color: '#e5e7eb' }}>
                          <span style={{ color: '#25D366' }}><IconCheck /></span>
                          <span>Lavado inicial: {booking.customMembership?.firstVisitServiceTitle || booking.service?.title}</span>
                          <span style={{ color: '#718096', fontSize: '0.8rem' }}>{formatDate(booking.date, { weekday: undefined })} · {booking.time}</span>
                        </div>
                        {(booking.membershipSchedule || []).map((visit) => (
                          <div key={visit._id || `${visit.date}-${visit.title}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: '10px', alignItems: 'center', color: visit.status === 'completed' ? '#718096' : '#e5e7eb' }}>
                            <span style={{ color: visit.status === 'completed' ? '#25D366' : '#D4AF37' }}><IconCheck /></span>
                            <span>{visit.title}</span>
                            <span style={{ color: '#718096', fontSize: '0.8rem' }}>{formatDate(visit.date, { weekday: undefined })} · {visit.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Historial Reciente</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <tbody>
                  {bookings.slice(0, 6).map((booking) => (
                    <tr key={booking._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '1rem 0', fontWeight: 600 }}>{getBookingTitle(booking)}</td>
                      <td style={{ padding: '1rem 0', color: '#718096' }}>{formatDisplayDate(booking.date)}</td>
                      <td style={{ padding: '1rem 0', textAlign: 'right' }}>
                        <span style={{ color: paymentColor(booking), fontSize: '0.85rem', fontWeight: 700 }}>
                          {paymentLabel(booking)}
                        </span>
                        {booking.pointsAwarded && (
                          <p style={{ color: '#D4AF37', fontSize: '0.78rem', margin: '4px 0 0' }}>
                            +{booking.loyaltyPointsAwarded || pointsToEarn(booking)} pts
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Avisos</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                {notifications.map((item) => (
                  <div key={`${item.title}-${item.message}`} style={{ padding: '12px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ margin: 0, color: '#D4AF37', fontSize: '0.82rem', fontWeight: 900 }}>{item.title}</p>
                    <p style={{ margin: '4px 0 0', color: '#a0aec0', fontSize: '0.82rem', lineHeight: 1.5 }}>{item.message}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Mi Calendario</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                {calendarPreviewEvents.length > 0 ? calendarPreviewEvents.map((event) => (
                  <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '12px', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ textAlign: 'center', borderRadius: '12px', padding: '8px', background: event.type === 'membresia' ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)' }}>
                      <p style={{ color: '#D4AF37', fontWeight: 900, margin: 0, fontSize: '0.95rem' }}>{formatDisplayDate(event.date, { day: 'numeric' })}</p>
                      <p style={{ color: '#718096', margin: 0, fontSize: '0.65rem', textTransform: 'uppercase' }}>{formatDisplayDate(event.date, { month: 'short' })}</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '0.88rem' }}>{event.title}</p>
                      <p style={{ margin: '3px 0 0', color: '#718096', fontSize: '0.78rem' }}>{event.time} · Placa {event.plate}</p>
                      <p style={{ margin: '3px 0 0', color: '#718096', fontSize: '0.74rem' }}>{getWashModeLabel(event.washMode)}</p>
                    </div>
                  </div>
                )) : (
                  <p style={{ color: '#718096', margin: 0 }}>No hay eventos proximos.</p>
                )}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Fidelidad</h3>
              <p style={{ color: '#a0aec0', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Ganas 10 pts por cada Q{pointsBundleSpend} gastados, o 1 pt por cada Q{formatQuetzalesRate(loyaltyInfo.pointsRateQuetzales || 3)}.
              </p>
              <div style={{ background: 'rgba(212,175,55,0.05)', padding: '1.5rem', borderRadius: '20px', border: '1px dotted rgba(212,175,55,0.3)' }}>
                <p style={{ color: '#D4AF37', fontWeight: 800, margin: 0 }}>Reseña completada: +{loyaltyInfo.reviewBonusPoints} pts extra</p>
              </div>
              <div style={{ background: 'rgba(212,175,55,0.05)', padding: '1.5rem', borderRadius: '20px', border: '1px dotted rgba(212,175,55,0.3)' }}>
                <p style={{ color: '#D4AF37', fontWeight: 800, margin: 0 }}>
                  Cada {loyaltyInfo.redemptionBlockPoints} pts son Q{formatQuetzalesRate(loyaltyInfo.redemptionDiscountQuetzales)} de descuento
                </p>
              </div>
              <div style={{ marginTop: '1rem', background: 'rgba(37,211,102,0.06)', padding: '1rem', borderRadius: '18px', border: '1px solid rgba(37,211,102,0.18)', display: 'grid', gap: '10px' }}>
                <p style={{ color: '#25D366', fontWeight: 900, margin: 0 }}>Tu codigo: {referralCode || 'Pendiente'}</p>
                <p style={{ color: '#a0aec0', fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
                  Quien lo use recibe {loyaltyInfo.referralDiscountPercent}% de descuento y tu ganas {loyaltyInfo.referralRewardPoints} pts cuando pague.
                </p>
                <button type="button" onClick={shareReferralCode} style={{ ...ghostBtn, width: '100%', padding: '11px 14px', color: '#25D366', borderColor: 'rgba(37,211,102,0.28)' }}>
                  {referralCode ? 'Compartir por WhatsApp' : 'Generar y compartir'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button type="button" onClick={() => window.location.href = '/#servicios'} style={{ ...goldBtn, width: '100%', padding: '16px' }}>Agendar Nuevo Lavado</button>
              <button type="button" onClick={logout} style={{ ...ghostBtn, width: '100%', padding: '16px', color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.2)' }}>Cerrar Sesión</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
