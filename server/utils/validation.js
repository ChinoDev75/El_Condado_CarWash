const mongoose = require('mongoose');
const {
  getBusinessDateKey,
  parseDateKeyToUtcDate
} = require('./dateTime');

const BOOKING_STATUSES = new Set(['pending', 'confirmed', 'completed', 'cancelled']);
const PAYMENT_STATUSES = new Set(['unpaid', 'paid', 'failed']);
const SERVICE_CATEGORIES = new Set(['lavado', 'promo', 'membresia', 'extra']);

const SERVICE_FIELDS = [
  'title',
  'price',
  'durationMinutes',
  'oldPrice',
  'description',
  'features',
  'category',
  'tag',
  'iconName',
  'recurrenteProductId',
  'waMsg',
  'isTrimestral',
  'period'
];

const sanitizeString = (value, maxLength = 250) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
};

const normalizeEmail = (value) => sanitizeString(value, 254).toLowerCase();

const isValidEmail = (value) => (
  typeof value === 'string' &&
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) &&
  value.length <= 254
);

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'admin123',
  'changeme',
  'iloveyou',
  'carwash123',
  'condado123'
]);

const PASSWORD_POLICY_MESSAGE = 'La contraseña debe tener 10 a 128 caracteres, mayúscula, minúscula, número y símbolo.';
const PLATE_POLICY_MESSAGE = 'La placa debe tener formato P123ASD: letra P, 3 numeros y 3 letras.';

const normalizeComparableText = (value) => (
  sanitizeString(value, 254)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
);

const getPasswordIssues = (value, context = {}) => {
  const issues = [];

  if (typeof value !== 'string') {
    return ['La contraseña es obligatoria.'];
  }

  if (value.length < 10) issues.push('Usa al menos 10 caracteres.');
  if (value.length > 128) issues.push('Usa 128 caracteres o menos.');
  if (/\s/.test(value)) issues.push('Evita espacios en la contraseña.');
  if (!/[a-z]/.test(value)) issues.push('Agrega una letra minuscula.');
  if (!/[A-Z]/.test(value)) issues.push('Agrega una letra mayuscula.');
  if (!/\d/.test(value)) issues.push('Agrega un numero.');
  if (!/[^A-Za-z0-9\s]/.test(value)) issues.push('Agrega un simbolo.');
  if (/(.)\1{3,}/.test(value)) issues.push('Evita repetir el mismo caracter muchas veces.');

  const normalizedPassword = normalizeComparableText(value);
  if (COMMON_PASSWORDS.has(normalizedPassword)) {
    issues.push('Elige una contraseña menos común.');
  }

  const namePart = normalizeComparableText(context.name);
  if (namePart && namePart.length >= 4 && normalizedPassword.includes(namePart)) {
    issues.push('No uses tu nombre dentro de la contraseña.');
  }

  const emailPart = normalizeComparableText(String(context.email || '').split('@')[0]);
  if (emailPart && emailPart.length >= 4 && normalizedPassword.includes(emailPart)) {
    issues.push('No uses tu correo dentro de la contraseña.');
  }

  return issues;
};

const isValidPassword = (value, context = {}) => getPasswordIssues(value, context).length === 0;

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const sanitizePlate = (value) => (
  sanitizeString(value, 20)
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7)
);

const getPlateIssues = (value) => {
  const rawPlate = sanitizeString(value, 20).toUpperCase().replace(/\s+/g, '');
  const plate = sanitizePlate(value);
  const issues = [];

  if (!plate) return ['La placa es obligatoria.'];
  if (/[^A-Z0-9]/.test(rawPlate)) issues.push('Solo se permiten letras y numeros, sin guiones ni simbolos.');
  if (rawPlate.length !== 7 || plate.length !== 7) issues.push('Debe tener exactamente 7 caracteres.');
  if (plate[0] !== 'P') issues.push('Debe empezar con la letra P.');
  if (!/^P\d{3}[A-Z]{3}$/.test(plate)) issues.push('Formato correcto: P123ASD.');

  return issues;
};

const isValidPlate = (value) => getPlateIssues(value).length === 0;

const parseBookingDate = (value) => {
  const parsed = parseDateKeyToUtcDate(value);
  if (!parsed) return null;

  return value >= getBusinessDateKey() ? parsed : null;
};

const isValidBookingTime = (value) => {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

const parseServicePriceCents = (price) => {
  const numeric = Number.parseFloat(String(price).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric * 100);
};

const pickServiceInput = (body) => {
  const input = {};

  SERVICE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      input[field] = body[field];
    }
  });

  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    input.title = sanitizeString(input.title, 100);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'price')) {
    input.price = sanitizeString(input.price, 20);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'durationMinutes')) {
    input.durationMinutes = Number(input.durationMinutes);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'oldPrice')) {
    input.oldPrice = input.oldPrice ? sanitizeString(input.oldPrice, 20) : null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'description')) {
    input.description = sanitizeString(input.description, 500);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'features')) {
    input.features = Array.isArray(input.features)
      ? input.features.slice(0, 12).map((feature) => sanitizeString(feature, 160)).filter(Boolean)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(input, 'category')) {
    input.category = sanitizeString(input.category, 30);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'tag')) {
    input.tag = input.tag ? sanitizeString(input.tag, 40) : null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'iconName')) {
    input.iconName = sanitizeString(input.iconName, 40);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'recurrenteProductId')) {
    input.recurrenteProductId = input.recurrenteProductId ? sanitizeString(input.recurrenteProductId, 120) : null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'waMsg')) {
    input.waMsg = sanitizeString(input.waMsg, 300);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'period')) {
    input.period = input.period ? sanitizeString(input.period, 40) : null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'isTrimestral')) {
    input.isTrimestral = Boolean(input.isTrimestral);
  }

  return input;
};

module.exports = {
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
  SERVICE_CATEGORIES,
  PASSWORD_POLICY_MESSAGE,
  PLATE_POLICY_MESSAGE,
  sanitizeString,
  normalizeEmail,
  isValidEmail,
  getPasswordIssues,
  isValidPassword,
  isValidObjectId,
  sanitizePlate,
  getPlateIssues,
  isValidPlate,
  parseBookingDate,
  isValidBookingTime,
  parseServicePriceCents,
  pickServiceInput
};
