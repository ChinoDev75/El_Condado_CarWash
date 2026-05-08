const crypto = require('crypto');
const User = require('../models/User');
const { sanitizeString } = require('./validation');

const REFERRAL_DISCOUNT_RATE = 0.05;
const REFERRAL_REWARD_POINTS = 20;

const normalizeReferralCode = (value) => (
  sanitizeString(value, 24)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
);

const roundToWholeQuetzalCents = (cents) => Math.max(0, Math.round((Number(cents) || 0) / 100) * 100);

const createReferralCodeCandidate = (name = '') => {
  const prefix = normalizeReferralCode(name)
    .replace(/[AEIOU]/g, '')
    .slice(0, 3)
    .padEnd(3, 'CW');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}${suffix}`.slice(0, 9);
};

const assignReferralCode = async (user, referralCode) => {
  user.referralCode = referralCode;

  try {
    await user.save({ validateBeforeSave: false });
    return referralCode;
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }

    user.referralCode = '';
    return null;
  }
};

const ensureReferralCode = async (user) => {
  if (!user) return null;
  if (user.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = createReferralCodeCandidate(user.name);
    const exists = await User.exists({ referralCode });
    if (!exists) {
      const assignedCode = await assignReferralCode(user, referralCode);
      if (assignedCode) {
        return assignedCode;
      }
    }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const fallback = crypto.randomBytes(5).toString('hex').toUpperCase();
    const assignedCode = await assignReferralCode(user, fallback);
    if (assignedCode) {
      return assignedCode;
    }
  }

  throw new Error('No se pudo generar un codigo de referido unico.');
};

const findValidReferrer = async (rawCode, buyerUserId) => {
  const referralCode = normalizeReferralCode(rawCode);
  if (!referralCode) {
    return { error: 'Codigo de referido invalido.' };
  }

  const referrer = await User.findOne({ referralCode }).select('name email referralCode loyalty_points');
  if (!referrer) {
    return { error: 'Codigo de referido no encontrado.' };
  }

  if (buyerUserId && String(referrer._id) === String(buyerUserId)) {
    return { error: 'No puedes usar tu propio codigo de referido.' };
  }

  return { referrer, referralCode };
};

const buildReferralDiscount = (subtotalCents) => ({
  discountCents: roundToWholeQuetzalCents((Number(subtotalCents) || 0) * REFERRAL_DISCOUNT_RATE),
  discountRatePercent: Math.round(REFERRAL_DISCOUNT_RATE * 100)
});

const awardReferralReward = async (booking) => {
  if (
    !booking?.referral?.referrer ||
    booking.referral.rewardAwarded ||
    booking.paymentStatus !== 'paid'
  ) {
    return false;
  }

  await User.findByIdAndUpdate(booking.referral.referrer, {
    $inc: { loyalty_points: booking.referral.rewardPoints || REFERRAL_REWARD_POINTS }
  });

  booking.referral.rewardAwarded = true;
  booking.referral.rewardAwardedAt = new Date();
  return true;
};

module.exports = {
  REFERRAL_DISCOUNT_RATE,
  REFERRAL_REWARD_POINTS,
  awardReferralReward,
  buildReferralDiscount,
  ensureReferralCode,
  findValidReferrer,
  normalizeReferralCode,
  roundToWholeQuetzalCents
};
