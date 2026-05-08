const User = require('../models/User');
const { parseServicePriceCents } = require('./validation');

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const POINT_CENTS_VALUE = parsePositiveNumber(process.env.LOYALTY_POINT_CENTS_VALUE, 300);
const REVIEW_BONUS_POINTS = parsePositiveNumber(process.env.LOYALTY_REVIEW_BONUS_POINTS, 10);
const POINT_REDEMPTION_BLOCK_POINTS = parsePositiveNumber(process.env.LOYALTY_REDEMPTION_BLOCK_POINTS, 100);
const POINT_REDEMPTION_DISCOUNT_CENTS = parsePositiveNumber(process.env.LOYALTY_REDEMPTION_DISCOUNT_CENTS, 2000);

const getPointsRateQuetzales = () => POINT_CENTS_VALUE / 100;
const getRedemptionDiscountQuetzales = () => POINT_REDEMPTION_DISCOUNT_CENTS / 100;

const normalizeRedemptionPoints = (points) => {
  const parsed = Number(points);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed / POINT_REDEMPTION_BLOCK_POINTS) * POINT_REDEMPTION_BLOCK_POINTS;
};

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

const getLoyaltyRedemptionQuote = async ({ userId, requestedPoints, subtotalCents }) => {
  const points = normalizeRedemptionPoints(requestedPoints);
  if (!points) {
    return { points: 0, discountCents: 0 };
  }

  const subtotal = Number(subtotalCents) || 0;
  const blocks = points / POINT_REDEMPTION_BLOCK_POINTS;
  const discountCents = blocks * POINT_REDEMPTION_DISCOUNT_CENTS;

  if (discountCents > subtotal) {
    return { error: 'El descuento de puntos supera el subtotal disponible.' };
  }

  const user = await User.findById(userId).select('loyalty_points');
  if (!user) {
    return { error: 'Usuario no encontrado.' };
  }

  if ((user.loyalty_points || 0) < points) {
    return { error: 'No tienes suficientes puntos para aplicar ese descuento.' };
  }

  return {
    points,
    discountCents,
    availablePoints: user.loyalty_points || 0
  };
};

const reserveLoyaltyPoints = async (userId, points) => {
  const normalizedPoints = normalizeRedemptionPoints(points);
  if (!normalizedPoints) return true;

  const user = await User.findOneAndUpdate(
    { _id: userId, loyalty_points: { $gte: normalizedPoints } },
    { $inc: { loyalty_points: -normalizedPoints } },
    { new: true }
  );

  return Boolean(user);
};

const refundLoyaltyPoints = async (userId, points) => {
  const normalizedPoints = normalizeRedemptionPoints(points);
  if (!userId || !normalizedPoints) return 0;

  await User.findByIdAndUpdate(userId, { $inc: { loyalty_points: normalizedPoints } });
  return normalizedPoints;
};

const refundBookingLoyaltyRedemption = async (booking) => {
  const points = booking?.loyaltyRedemption?.points || 0;
  if (!booking?.user || !points || booking.loyaltyRedemption.refunded) {
    return 0;
  }

  await refundLoyaltyPoints(booking.user, points);
  booking.loyaltyRedemption.refunded = true;
  booking.loyaltyRedemption.refundedAt = new Date();
  return points;
};

module.exports = {
  POINT_REDEMPTION_BLOCK_POINTS,
  POINT_REDEMPTION_DISCOUNT_CENTS,
  REVIEW_BONUS_POINTS,
  calculateLoyaltyPoints,
  getLoyaltyRedemptionQuote,
  getPointsRateQuetzales,
  getRedemptionDiscountQuetzales,
  refundBookingLoyaltyRedemption,
  refundLoyaltyPoints,
  reserveLoyaltyPoints
};
