const express = require('express');
const router = express.Router();
const {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  seedServices
} = require('../controllers/serviceController');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/services
// @desc    Get all services (optionally filter by ?category=)
router.get('/', getServices);

// @route   POST api/services/seed
// @desc    Seed database with default services
router.post('/seed', protect, authorize('admin'), seedServices);

// @route   GET api/services/:id
// @desc    Get single service
router.get('/:id', getServiceById);

// @route   POST api/services
// @desc    Add new service (Admin only)
router.post('/', protect, authorize('admin'), createService);

// @route   PUT api/services/:id
// @desc    Update service (Admin only)
router.put('/:id', protect, authorize('admin'), updateService);

// @route   DELETE api/services/:id
// @desc    Delete service (Admin only)
router.delete('/:id', protect, authorize('admin'), deleteService);

module.exports = router;
