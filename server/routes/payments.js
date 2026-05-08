const express = require('express');
const router = express.Router();
const axios = require('axios');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { isValidObjectId } = require('../utils/validation');
const { awardReferralReward } = require('../utils/referrals');
const { reserveLoyaltyPoints } = require('../utils/loyaltyPoints');
const { isSlotAvailable } = require('../utils/scheduler');
const { auditLog } = require('../utils/auditLogger');

const paymentLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, name: 'payments' });

const userCanAccessBooking = (req, booking) => (
  req.user.role === 'admin' || (booking.user && booking.user.toString() === req.user.id)
);

const appendInternalNote = (booking, note) => {
  const currentNotes = booking.internalNotes || '';
  if (currentNotes.includes(note)) return currentNotes;

  return [currentNotes, note].filter(Boolean).join('\n').slice(0, 500);
};

const paidNeedsReprogrammingMessage = 'El pago fue recibido, pero la reserva no quedo confirmada. Contactanos para reprogramarla.';

const captureRefundedLoyaltyRedemption = async (booking) => {
  const points = booking.loyaltyRedemption?.points || 0;
  if (!points || !booking.loyaltyRedemption.refunded) {
    return true;
  }

  const reserved = await reserveLoyaltyPoints(booking.user, points);
  if (reserved) {
    booking.loyaltyRedemption.refunded = false;
    booking.loyaltyRedemption.refundedAt = null;
    return true;
  }

  booking.internalNotes = appendInternalNote(
    booking,
    'El pago uso descuento de puntos, pero los puntos ya habian sido devueltos y no se pudieron capturar de nuevo.'
  );
  return false;
};

const canConfirmPaidBooking = async (booking) => {
  await booking.populate('service', 'title durationMinutes');

  const firstVisitDuration = booking.customMembership?.firstVisitDurationMinutes || booking.service?.durationMinutes || 60;
  const firstVisitAvailable = await isSlotAvailable({
    date: booking.date,
    time: booking.time,
    durationMinutes: firstVisitDuration,
    excludeBookingId: booking._id
  });

  if (!firstVisitAvailable) {
    return false;
  }

  for (const visit of booking.membershipSchedule || []) {
    if (visit.status !== 'scheduled') {
      continue;
    }

    const visitAvailable = await isSlotAvailable({
      date: visit.date,
      time: visit.time,
      durationMinutes: visit.durationMinutes || 60,
      excludeBookingId: booking._id
    });

    if (!visitAvailable) {
      return false;
    }
  }

  return true;
};

const markPaidWithoutConfirmation = async (booking, note, eventId = null) => {
  const now = new Date();
  booking.paymentStatus = 'paid';
  booking.paidAt = booking.paidAt || now;
  booking.status = 'cancelled';
  booking.expiresAt = null;
  booking.internalNotes = appendInternalNote(booking, note);

  if (eventId) {
    booking.recurrenteEventId = eventId;
  }

  await captureRefundedLoyaltyRedemption(booking);
  await awardReferralReward(booking);
  await booking.save();
};

const markBookingPaid = async (booking, eventId = null) => {
  const now = new Date();
  const paymentHoldExpired = booking.expiresAt && booking.expiresAt <= now;
  const cannotAutoConfirm = booking.status === 'cancelled' || paymentHoldExpired;

  if (cannotAutoConfirm) {
    await markPaidWithoutConfirmation(
      booking,
      'Pago recibido despues de que la reserva expiro. Reprogramar manualmente antes de atender.',
      eventId
    );
    return { confirmed: false, reason: 'expired' };
  }

  const canConfirm = await canConfirmPaidBooking(booking);
  if (!canConfirm) {
    await markPaidWithoutConfirmation(
      booking,
      'Pago recibido, pero el horario ya no esta disponible. Reprogramar manualmente antes de atender.',
      eventId
    );
    return { confirmed: false, reason: 'slot_conflict' };
  }

  if (booking.paymentStatus !== 'paid') {
    booking.paymentStatus = 'paid';
    booking.status = 'confirmed';
    booking.paidAt = now;
    booking.expiresAt = null;
  }

  if (eventId) {
    booking.recurrenteEventId = eventId;
  }

  await captureRefundedLoyaltyRedemption(booking);
  await awardReferralReward(booking);
  try {
    await booking.save();
  } catch (error) {
    if (error.code === 11000) {
      await markPaidWithoutConfirmation(
        booking,
        'Pago recibido, pero el horario ya no esta disponible. Reprogramar manualmente antes de atender.',
        eventId
      );
      return { confirmed: false, reason: 'slot_conflict' };
    }

    throw error;
  }

  return { confirmed: true };
};

router.get('/verify/:bookingId', protect, paymentLimiter, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.bookingId)) {
      return res.status(400).json({ message: 'Id de reserva invalido' });
    }

    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    if (!userCanAccessBooking(req, booking)) {
      return res.status(403).json({ message: 'No autorizado para verificar esta reserva' });
    }

    if (booking.paymentStatus === 'paid') {
      const awarded = await awardReferralReward(booking);
      if (awarded) {
        await booking.save();
      }

      if (booking.status === 'cancelled') {
        return res.json({
          status: 'paid_expired',
          message: paidNeedsReprogrammingMessage
        });
      }

      return res.json({ status: 'paid', message: 'La reserva ya esta pagada' });
    }

    if (booking.recurrenteCheckoutId === 'simulated') {
      if (process.env.NODE_ENV === 'production') {
        return res.status(400).json({ message: 'Pago simulado no permitido en produccion' });
      }

      const paymentResult = await markBookingPaid(booking, 'simulated');
      auditLog('payment.verified_simulated', { userId: req.user.id, bookingId: booking._id });
      if (!paymentResult.confirmed) {
        return res.json({
          status: 'paid_expired',
          message: paidNeedsReprogrammingMessage
        });
      }
      return res.json({ status: 'paid', message: 'Simulacion: pago verificado exitosamente' });
    }

    if (!process.env.RECURRENTE_PUBLIC_KEY || !process.env.RECURRENTE_SECRET_KEY) {
      return res.status(503).json({ message: 'Pasarela de pagos no configurada' });
    }

    const response = await axios.get(`https://app.recurrente.com/api/checkouts/${booking.recurrenteCheckoutId}`, {
      headers: {
        'X-PUBLIC-KEY': process.env.RECURRENTE_PUBLIC_KEY,
        'X-SECRET-KEY': process.env.RECURRENTE_SECRET_KEY
      },
      timeout: 10000
    });

    if (response.data.status === 'paid' || response.data.status === 'completed') {
      const paymentResult = await markBookingPaid(booking, response.data.id);
      auditLog('payment.verified', { userId: req.user.id, bookingId: booking._id });
      if (!paymentResult.confirmed) {
        return res.json({
          status: 'paid_expired',
          message: paidNeedsReprogrammingMessage
        });
      }
      return res.json({ status: 'paid', message: 'Pago verificado exitosamente' });
    }

    return res.json({ status: booking.paymentStatus, message: 'El pago aun no se ha completado' });
  } catch (error) {
    console.error('Error al verificar pago:', error.message);
    return res.status(500).json({ message: 'Error al contactar con la pasarela de pagos' });
  }
});

const verifyWebhookSecret = (req, res, next) => {
  const configuredSecret = process.env.RECURRENTE_WEBHOOK_SECRET;
  const providedSecret = req.get('X-Webhook-Secret') || req.get('X-Recurrente-Webhook-Secret');

  if (configuredSecret) {
    if (providedSecret !== configuredSecret) {
      auditLog('payment.webhook_rejected', { reason: 'bad_secret' });
      return res.status(401).json({ message: 'Webhook no autorizado' });
    }

    return next();
  }

  if (process.env.NODE_ENV === 'production') {
    auditLog('payment.webhook_rejected', { reason: 'missing_configured_secret' });
    return res.status(500).json({ message: 'Webhook no configurado' });
  }

  auditLog('payment.webhook_unverified_dev');
  return next();
};

router.post('/webhook', verifyWebhookSecret, async (req, res) => {
  const event = req.body || {};
  const checkoutData = event.checkout || event;
  const eventId = event.id || event.event_id || checkoutData.id || null;
  const eventType = event.event_type || event.type || 'unknown';
  const status = checkoutData.status || event.status || 'unknown';

  try {
    const isSuccess = eventType === 'checkout.completed' || status === 'completed' || status === 'paid';
    if (!isSuccess) {
      auditLog('payment.webhook_ignored', { eventId, eventType, status });
      return res.status(200).json({ message: 'Webhook ignored' });
    }

    const bookingId = checkoutData.external_id || event.external_id;
    if (!isValidObjectId(bookingId)) {
      auditLog('payment.webhook_invalid_booking', { eventId, eventType });
      return res.status(202).json({ message: 'Webhook received without valid booking id' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      auditLog('payment.webhook_booking_missing', { eventId, bookingId });
      return res.status(202).json({ message: 'Booking not found' });
    }

    if (booking.recurrenteEventId && eventId && booking.recurrenteEventId === eventId) {
      return res.status(200).json({ message: 'Webhook already processed' });
    }

    const paymentResult = await markBookingPaid(booking, eventId);
    auditLog(paymentResult.confirmed ? 'payment.webhook_paid' : 'payment.webhook_paid_expired', { eventId, bookingId });
    return res.status(200).json({ message: 'Webhook received' });
  } catch (error) {
    console.error('Error critico webhook:', error.message);
    return res.status(500).json({ message: 'Error al procesar webhook' });
  }
});

module.exports = router;
