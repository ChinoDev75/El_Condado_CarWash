const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const ClientInvite = require('../models/ClientInvite');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const {
  getPasswordIssues,
  isValidEmail,
  normalizeEmail,
  sanitizeString
} = require('../utils/validation');
const { ensureReferralCode } = require('../utils/referrals');
const { calculateLoyaltyPoints } = require('../utils/loyaltyPoints');
const { auditLog } = require('../utils/auditLogger');

const router = express.Router();
const inviteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, name: 'client_invites' });
const INVITE_EXPIRATION_DAYS = 30;

const normalizePhone = (value) => sanitizeString(value, 30).replace(/[^\d+]/g, '');

const whatsappPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 8) return `502${digits}`;
  return digits;
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createTokenBundle = () => {
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashToken(token);
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + INVITE_EXPIRATION_DAYS);
  return { token, tokenHash, tokenExpiresAt };
};

const buildInviteLinks = ({ token, name, phone }) => {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const inviteUrl = `${clientUrl}/crear-cuenta/${token}`;
  const message = [
    `Hola ${name}, te cree tu perfil en El Condado CarWash.`,
    'Completa tu cuenta con correo y contrasena aqui:',
    inviteUrl
  ].join(' ');

  return {
    inviteUrl,
    whatsappUrl: `https://wa.me/${whatsappPhone(phone)}?text=${encodeURIComponent(message)}`
  };
};

const serializeInvite = (invite) => ({
  _id: invite._id,
  name: invite.name,
  phone: invite.phone,
  address: invite.address,
  status: invite.status,
  user: invite.user,
  claimedAt: invite.claimedAt,
  tokenExpiresAt: invite.tokenExpiresAt,
  lastInviteUrl: invite.lastInviteUrl,
  lastWhatsappUrl: invite.lastWhatsappUrl,
  createdAt: invite.createdAt,
  updatedAt: invite.updatedAt
});

const sendTokenResponse = (user, statusCode, res) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });

  return res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      referralCode: user.referralCode,
      role: user.role,
      loyalty_points: user.loyalty_points
    }
  });
};

router.get('/invitations/:token', inviteLimiter, async (req, res) => {
  try {
    const token = sanitizeString(req.params.token, 120);
    const invite = await ClientInvite.findOne({ tokenHash: hashToken(token) });

    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ message: 'Invitacion no encontrada o ya utilizada.' });
    }

    if (invite.tokenExpiresAt <= new Date()) {
      return res.status(410).json({ message: 'Esta invitacion expiro. Pide un nuevo enlace.' });
    }

    return res.status(200).json({
      name: invite.name,
      phone: invite.phone,
      address: invite.address,
      tokenExpiresAt: invite.tokenExpiresAt
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error al cargar invitacion' });
  }
});

router.post('/invitations/:token/complete', inviteLimiter, async (req, res) => {
  try {
    const token = sanitizeString(req.params.token, 120);
    const invite = await ClientInvite.findOne({ tokenHash: hashToken(token) });

    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ message: 'Invitacion no encontrada o ya utilizada.' });
    }

    if (invite.tokenExpiresAt <= new Date()) {
      return res.status(410).json({ message: 'Esta invitacion expiro. Pide un nuevo enlace.' });
    }

    const name = sanitizeString(req.body.name || invite.name, 80);
    const address = sanitizeString(req.body.address || invite.address, 220);
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    const passwordIssues = getPasswordIssues(password, { name, email });

    if (!name || !address || !isValidEmail(email) || passwordIssues.length > 0) {
      return res.status(400).json({
        message: !name || !address || !isValidEmail(email)
          ? 'Nombre, direccion o correo invalidos.'
          : `Contrasena insegura: ${passwordIssues[0]}`
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'El correo ya esta registrado.' });
    }

    const user = await User.create({
      name,
      email,
      phone: invite.phone,
      address,
      password,
      role: 'client'
    });
    await ensureReferralCode(user);

    invite.status = 'claimed';
    invite.user = user._id;
    invite.claimedAt = new Date();
    await invite.save();

    const linkedBookings = await Booking.find({ clientInvite: invite._id });
    let awardedPoints = 0;

    for (const booking of linkedBookings) {
      booking.user = user._id;
      booking.customerName = user.name;
      booking.customerEmail = user.email;
      booking.customerPhone = user.phone || booking.customerPhone;
      booking.customerAddress = user.address || booking.customerAddress;

      if (booking.status === 'completed' && booking.paymentStatus === 'paid' && !booking.pointsAwarded) {
        await booking.populate('service', 'price');
        const points = calculateLoyaltyPoints(booking);
        booking.pointsAwarded = true;
        booking.loyaltyPointsAwarded = points;
        awardedPoints += points;
      }

      await booking.save();
    }

    if (awardedPoints > 0) {
      user.loyalty_points = (user.loyalty_points || 0) + awardedPoints;
      await user.save();
    }

    auditLog('client_invite.claimed', { inviteId: invite._id, userId: user._id, linkedBookings: linkedBookings.length, awardedPoints });
    return sendTokenResponse(user, 201, res);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'El correo ya esta registrado.' });
    }

    console.error(error);
    return res.status(500).json({ message: 'Error al completar invitacion' });
  }
});

router.use(protect);
router.use(authorize('admin'));

router.get('/', async (req, res) => {
  try {
    const invites = await ClientInvite.find()
      .populate('user', 'name email phone address referralCode loyalty_points role createdAt')
      .sort('-createdAt');

    return res.status(200).json(invites.map(serializeInvite));
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener clientes invitados' });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = sanitizeString(req.body.name, 100);
    const phone = normalizePhone(req.body.phone);
    const address = sanitizeString(req.body.address, 220);

    if (!name || !phone || !address) {
      return res.status(400).json({ message: 'Nombre, telefono y direccion son obligatorios.' });
    }

    const { token, tokenHash, tokenExpiresAt } = createTokenBundle();
    const links = buildInviteLinks({ token, name, phone });

    const invite = await ClientInvite.create({
      name,
      phone,
      address,
      tokenHash,
      tokenExpiresAt,
      createdBy: req.user.id,
      lastInviteUrl: links.inviteUrl,
      lastWhatsappUrl: links.whatsappUrl
    });

    auditLog('client_invite.created', { adminId: req.user.id, inviteId: invite._id });
    return res.status(201).json({
      ...serializeInvite(invite),
      inviteUrl: links.inviteUrl,
      whatsappUrl: links.whatsappUrl
    });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: 'No se pudo crear el cliente invitado.' });
  }
});

router.post('/:id/resend', async (req, res) => {
  try {
    const invite = await ClientInvite.findById(req.params.id);
    if (!invite) {
      return res.status(404).json({ message: 'Cliente invitado no encontrado.' });
    }

    if (invite.status === 'claimed') {
      return res.status(400).json({ message: 'Este cliente ya completo su cuenta.' });
    }

    const { token, tokenHash, tokenExpiresAt } = createTokenBundle();
    const links = buildInviteLinks({ token, name: invite.name, phone: invite.phone });
    invite.tokenHash = tokenHash;
    invite.tokenExpiresAt = tokenExpiresAt;
    invite.status = 'pending';
    invite.lastInviteUrl = links.inviteUrl;
    invite.lastWhatsappUrl = links.whatsappUrl;
    await invite.save();

    auditLog('client_invite.resent', { adminId: req.user.id, inviteId: invite._id });
    return res.status(200).json({
      ...serializeInvite(invite),
      inviteUrl: links.inviteUrl,
      whatsappUrl: links.whatsappUrl
    });
  } catch (error) {
    return res.status(400).json({ message: 'No se pudo regenerar la invitacion.' });
  }
});

module.exports = router;
