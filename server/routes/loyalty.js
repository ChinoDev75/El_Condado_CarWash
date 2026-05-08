const express = require('express');
const router = express.Router();
const {
  createReview,
  getServiceReviews,
  getLoyaltyPoints,
  validateReferralCode
} = require('../controllers/loyaltyController');
const { protect } = require('../middleware/auth');
const Review = require('../models/Review');

// Rutas de fidelidad
router.get('/me', protect, getLoyaltyPoints);
router.get('/referrals/:code', protect, validateReferralCode);

// Rutas de reseñas
router.get('/reviews/all', async (req, res) => {
  try {
    const reviews = await Review.find().populate('user', 'name').sort('-createdAt').limit(6);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener reseñas' });
  }
});
router.get('/service/:serviceId', getServiceReviews);
router.post('/reviews', protect, createReview);

module.exports = router;
