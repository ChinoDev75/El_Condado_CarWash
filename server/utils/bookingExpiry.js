const Booking = require('../models/Booking');
const { auditLog } = require('./auditLogger');

const expireUnpaidBookings = async () => {
  const result = await Booking.updateMany(
    {
      status: { $in: ['awaiting_payment', 'pending'] },
      paymentStatus: 'unpaid',
      expiresAt: { $lte: new Date() }
    },
    {
      $set: {
        status: 'cancelled',
        internalNotes: 'Reserva expirada automaticamente por falta de pago.'
      }
    }
  );

  if (result.modifiedCount > 0) {
    auditLog('booking.expired_unpaid', { count: result.modifiedCount });
  }

  return result.modifiedCount || 0;
};

module.exports = { expireUnpaidBookings };
