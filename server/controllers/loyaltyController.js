const Review = require('../models/Review');
const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const {
  isValidObjectId,
  sanitizeString
} = require('../utils/validation');
const {
  REVIEW_BONUS_POINTS,
  POINT_REDEMPTION_BLOCK_POINTS,
  POINT_REDEMPTION_DISCOUNT_CENTS,
  getPointsRateQuetzales,
  getRedemptionDiscountQuetzales
} = require('../utils/loyaltyPoints');
const {
  REFERRAL_DISCOUNT_RATE,
  REFERRAL_REWARD_POINTS,
  ensureReferralCode,
  findValidReferrer
} = require('../utils/referrals');
const { auditLog } = require('../utils/auditLogger');

exports.getServiceReviews = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.serviceId)) {
      return res.status(400).json({ message: 'Id de servicio invalido' });
    }

    const reviews = await Review.find({ service: req.params.serviceId })
      .populate('user', 'name')
      .sort('-createdAt');

    return res.status(200).json(reviews);
  } catch (error) {
    return res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.createReview = async (req, res) => {
  try {
    const serviceId = req.body.service;
    const rating = Number(req.body.rating);
    const comment = sanitizeString(req.body.comment, 500);

    if (!isValidObjectId(serviceId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 5) {
      return res.status(400).json({ message: 'Datos de reseña invalidos' });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    const completedBooking = await Booking.findOne({
      user: req.user.id,
      service: serviceId,
      status: 'completed',
      paymentStatus: 'paid'
    });

    if (!completedBooking) {
      return res.status(403).json({
        message: 'Solo puedes dejar reseña de servicios pagados y completados.'
      });
    }

    const review = await Review.create({
      user: req.user.id,
      service: serviceId,
      rating,
      comment
    });

    await User.findByIdAndUpdate(req.user.id, {
      $inc: { loyalty_points: REVIEW_BONUS_POINTS }
    });

    auditLog('review.created', { userId: req.user.id, serviceId, reviewId: review._id });
    return res.status(201).json(review);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ya has dejado una reseña para este servicio' });
    }

    return res.status(400).json({ message: 'Error al crear la reseña' });
  }
};

exports.getLoyaltyPoints = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name loyalty_points referralCode');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    await ensureReferralCode(user);

    return res.status(200).json({
      points: user.loyalty_points,
      pointsRateQuetzales: getPointsRateQuetzales(),
      reviewBonusPoints: REVIEW_BONUS_POINTS,
      redemptionBlockPoints: POINT_REDEMPTION_BLOCK_POINTS,
      redemptionDiscountCents: POINT_REDEMPTION_DISCOUNT_CENTS,
      redemptionDiscountQuetzales: getRedemptionDiscountQuetzales(),
      referralCode: user.referralCode,
      referralDiscountPercent: Math.round(REFERRAL_DISCOUNT_RATE * 100),
      referralRewardPoints: REFERRAL_REWARD_POINTS
    });
  } catch (error) {
    console.error('Error al obtener fidelidad:', error.message);
    return res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.validateReferralCode = async (req, res) => {
  try {
    const result = await findValidReferrer(req.params.code, req.user.id);
    if (result.error) {
      const statusCode = result.error.includes('propio') ? 400 : 404;
      return res.status(statusCode).json({ message: result.error });
    }

    return res.status(200).json({
      valid: true,
      code: result.referralCode,
      referrerName: result.referrer.name,
      discountRatePercent: Math.round(REFERRAL_DISCOUNT_RATE * 100),
      rewardPoints: REFERRAL_REWARD_POINTS
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error del servidor' });
  }
};
