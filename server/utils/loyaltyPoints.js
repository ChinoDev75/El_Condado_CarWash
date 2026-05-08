const { parseServicePriceCents } = require('./validation');

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const POINT_CENTS_VALUE = parsePositiveNumber(process.env.LOYALTY_POINT_CENTS_VALUE, 300);
const REVIEW_BONUS_POINTS = parsePositiveNumber(process.env.LOYALTY_REVIEW_BONUS_POINTS, 10);

const getPointsRateQuetzales = () => POINT_CENTS_VALUE / 100;

const calculateLoyaltyPoints = (booking) => {
  const servicePriceCents = booking.service?.price
    ? parseServicePriceCents(booking.service.price)
    : 0;
  const baseCents = booking.subtotalCents || servicePriceCents || booking.totalCents || 0;

  if (!Number.isFinite(baseCents) || baseCents <= 0 || !Number.isFinite(POINT_CENTS_VALUE) || POINT_CENTS_VALUE <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor(baseCents / POINT_CENTS_VALUE));
};

module.exports = {
  REVIEW_BONUS_POINTS,
  calculateLoyaltyPoints,
  getPointsRateQuetzales
};
