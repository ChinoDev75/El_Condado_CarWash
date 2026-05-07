const express = require('express');
const router = express.Router();
const {
  cancelBooking,
  completeMembershipVisit,
  createAdminBooking,
  getBookingMetrics,
  getBookings,
  createBooking,
  rescheduleBooking,
  rescheduleMembershipVisit,
  updateBookingStatus
} = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // Todas las rutas de reservas requieren estar logueado

router.get('/', getBookings);
router.get('/metrics', authorize('admin'), getBookingMetrics);
router.post('/', createBooking);
router.post('/admin', authorize('admin'), createAdminBooking);
router.put('/:id/reschedule', rescheduleBooking);
router.put('/:id/cancel', cancelBooking);
router.put('/:bookingId/membership-visits/:visitId/reschedule', rescheduleMembershipVisit);
router.put('/:bookingId/membership-visits/:visitId/complete', authorize('admin'), completeMembershipVisit);
router.put('/:id', authorize('admin'), updateBookingStatus);

module.exports = router;
