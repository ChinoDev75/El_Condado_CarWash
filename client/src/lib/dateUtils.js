export const BUSINESS_UTC_OFFSET = "-06:00";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}/;

const pad = (value) => String(value).padStart(2, "0");

export const toDateKey = (value = new Date()) => {
  if (typeof value === "string" && DATE_KEY_PATTERN.test(value)) {
    return value.slice(0, 10);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const todayDateKey = () => toDateKey(new Date());

export const formatDisplayDate = (value, options = {}) => {
  const dateKey = toDateKey(value);
  if (!dateKey) return "";

  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("es-GT", {
    timeZone: "UTC",
    ...options,
  });
};

export const buildBusinessDateTime = (date, time) => {
  const dateKey = toDateKey(date);
  if (!dateKey || typeof time !== "string") return null;

  const value = new Date(`${dateKey}T${time}:00${BUSINESS_UTC_OFFSET}`);
  return Number.isNaN(value.getTime()) ? null : value;
};

export const compareBusinessDateTime = (a, b) => {
  const dateA = buildBusinessDateTime(a.date, a.time);
  const dateB = buildBusinessDateTime(b.date, b.time);

  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;
  return dateA.getTime() - dateB.getTime();
};
