const CLIENT_CHANGE_NOTICE_HOURS = 24;
const { buildBusinessDateTime } = require('./dateTime');

const buildAppointmentDateTime = (date, time) => {
  return buildBusinessDateTime(date, time);
};

const getHoursUntilAppointment = (booking, now = new Date()) => {
  const appointmentAt = buildAppointmentDateTime(booking.date, booking.time);
  if (!appointmentAt) return 0;
  return (appointmentAt.getTime() - now.getTime()) / (1000 * 60 * 60);
};

const canClientChangeBooking = (booking, now = new Date()) => {
  if (!booking.user) {
    return { allowed: false, reason: 'Esta reserva solo puede modificarse desde admin.' };
  }

  if (!['pending', 'confirmed'].includes(booking.status)) {
    return { allowed: false, reason: 'Esta reserva ya no se puede modificar.' };
  }

  if (getHoursUntilAppointment(booking, now) < CLIENT_CHANGE_NOTICE_HOURS) {
    return {
      allowed: false,
      reason: `Solo puedes cambiar o cancelar con al menos ${CLIENT_CHANGE_NOTICE_HOURS} horas de anticipacion.`
    };
  }

  return { allowed: true };
};

module.exports = {
  CLIENT_CHANGE_NOTICE_HOURS,
  buildAppointmentDateTime,
  canClientChangeBooking,
  getHoursUntilAppointment
};
