const express = require('express');
const router = express.Router();
const { getAvailability, getSchedule, updateSchedule } = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');

router.get('/schedule', getSchedule);
router.put('/schedule', protect, authorize('admin'), updateSchedule);
router.get('/availability', getAvailability);

module.exports = router;
