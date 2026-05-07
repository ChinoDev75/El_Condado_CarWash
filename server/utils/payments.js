const CARD_FEE_RATE = 0.045;
const CARD_FIXED_FEE_CENTS = 200;
const BOOKING_EXPIRATION_MINUTES = 15;
const PAYMENT_METHODS = new Set(['card', 'cash', 'transfer']);

const calculatePaymentAmounts = (subtotalCents, paymentMethod) => {
  const subtotal = Number(subtotalCents) || 0;
  const fee = paymentMethod === 'card'
    ? Math.round(subtotal * CARD_FEE_RATE) + CARD_FIXED_FEE_CENTS
    : 0;

  return {
    subtotalCents: subtotal,
    paymentFeeCents: fee,
    totalCents: subtotal + fee
  };
};

const getBookingExpiration = () => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + BOOKING_EXPIRATION_MINUTES);
  return expiresAt;
};

module.exports = {
  BOOKING_EXPIRATION_MINUTES,
  CARD_FEE_RATE,
  CARD_FIXED_FEE_CENTS,
  PAYMENT_METHODS,
  calculatePaymentAmounts,
  getBookingExpiration
};
