const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const User = require('../models/User');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, name: 'auth' });

// @route   POST api/auth/register
router.post('/register', authLimiter, register);

// @route   POST api/auth/login
router.post('/login', authLimiter, login);

// @route   GET api/auth/me
router.get('/me', protect, getMe);

// @route   GET api/auth/users
// @desc    Get all users (Admin only)
router.get('/users', protect, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find().select('name email role loyalty_points createdAt').sort('-createdAt');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
});

module.exports = router;
