const Booking = require('../models/Booking');
const { auditLog } = require('./auditLogger');
const { refundBookingLoyaltyRedemption } = require('./loyaltyPoints');

const expireUnpaidBookings = async () => {
  const bookings = await Booking.find({
    status: { $in: ['awaiting_payment', 'pending'] },
    paymentStatus: 'unpaid',
    expiresAt: { $lte: new Date() }
  });

  for (const booking of bookings) {
    await refundBookingLoyaltyRedemption(booking);
    booking.status = 'cancelled';
    booking.internalNotes = 'Reserva expirada automaticamente por falta de pago.';
    await booking.save();
  }

  if (bookings.length > 0) {
    auditLog('booking.expired_unpaid', { count: bookings.length });
  }

  return bookings.length;
};

module.exports = { expireUnpaidBookings };
