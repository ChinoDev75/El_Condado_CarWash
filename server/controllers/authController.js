const User = require('../models/User');
const jwt = require('jsonwebtoken');
const {
  sanitizeString,
  normalizeEmail,
  isValidEmail,
  getPasswordIssues
} = require('../utils/validation');
const { auditLog } = require('../utils/auditLogger');

exports.register = async (req, res) => {
  try {
    const name = sanitizeString(req.body.name, 80);
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    const passwordIssues = getPasswordIssues(password, { name, email });

    if (!name || !isValidEmail(email) || passwordIssues.length > 0) {
      return res.status(400).json({
        message: !name || !isValidEmail(email)
          ? 'Nombre o correo invalidos.'
          : `Contraseña insegura: ${passwordIssues[0]}`
      });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      auditLog('auth.register_duplicate', { email });
      return res.status(400).json({ message: 'El usuario ya existe' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'client'
    });

    auditLog('auth.register_success', { userId: user._id, email: user.email });
    return sendTokenResponse(user, 201, res);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }

    console.error(error);
    return res.status(500).json({ message: 'Error en el servidor' });
  }
};

exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!isValidEmail(email) || typeof password !== 'string') {
      return res.status(400).json({ message: 'Por favor proporciona correo y contraseña' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      auditLog('auth.login_failed', { email, reason: 'user_not_found' });
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      auditLog('auth.login_failed', { email, reason: 'bad_password' });
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    auditLog('auth.login_success', { userId: user._id, email: user.email });
    return sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error en el servidor' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name email role loyalty_points createdAt');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: 'Error en el servidor' });
  }
};

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
      role: user.role,
      loyalty_points: user.loyalty_points
    }
  });
};
