const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'America/Guatemala';
const BUSINESS_UTC_OFFSET = process.env.BUSINESS_UTC_OFFSET || '-06:00';

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

const toUtcDateKey = (date) => date.toISOString().slice(0, 10);

const getBusinessDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getBusinessTimeParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    hours: Number(values.hour),
    minutes: Number(values.minute)
  };
};

const getBusinessMinutes = (date = new Date()) => {
  const { hours, minutes } = getBusinessTimeParts(date);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
};

const parseDateKeyToUtcDate = (value) => {
  if (typeof value !== 'string' || !dateKeyPattern.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || toUtcDateKey(parsed) !== value) {
    return null;
  }

  return parsed;
};

const getDateKeyFromStoredDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && dateKeyPattern.test(value.slice(0, 10))) {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : toUtcDateKey(date);
};

const buildBusinessDateTime = (date, time) => {
  const dateKey = getDateKeyFromStoredDate(date);
  if (!dateKey || typeof time !== 'string') return null;

  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

  const value = new Date(`${dateKey}T${time}:00${BUSINESS_UTC_OFFSET}`);
  return Number.isNaN(value.getTime()) ? null : value;
};

module.exports = {
  BUSINESS_TIME_ZONE,
  BUSINESS_UTC_OFFSET,
  buildBusinessDateTime,
  getBusinessDateKey,
  getBusinessMinutes,
  getDateKeyFromStoredDate,
  parseDateKeyToUtcDate,
  toUtcDateKey
};
