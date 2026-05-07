const Booking = require('../models/Booking');
const BusinessSettings = require('../models/BusinessSettings');
const Service = require('../models/Service');
const { expireUnpaidBookings } = require('./bookingExpiry');
const {
  getBusinessDateKey,
  getBusinessMinutes,
  getDateKeyFromStoredDate,
  parseDateKeyToUtcDate
} = require('./dateTime');

const ACTIVE_BOOKING_STATUSES = ['awaiting_payment', 'pending', 'confirmed'];

const DEFAULT_WEEKLY_SCHEDULE = [
  { day: 0, enabled: false, start: '08:00', end: '17:00' },
  { day: 1, enabled: true, start: '08:00', end: '17:00' },
  { day: 2, enabled: true, start: '08:00', end: '17:00' },
  { day: 3, enabled: true, start: '08:00', end: '17:00' },
  { day: 4, enabled: true, start: '08:00', end: '17:00' },
  { day: 5, enabled: true, start: '08:00', end: '17:00' },
  { day: 6, enabled: true, start: '08:00', end: '14:00' }
];

const isValidTime = (value) => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);

const parseTimeToMinutes = (value) => {
  if (!isValidTime(value)) return null;

  const [hours, minutes] = value.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

const formatMinutes = (value) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const normalizeWeeklySchedule = (weeklySchedule = DEFAULT_WEEKLY_SCHEDULE) => {
  const byDay = new Map();

  weeklySchedule.forEach((entry) => {
    const day = Number(entry.day);
    const startMinutes = parseTimeToMinutes(entry.start);
    const endMinutes = parseTimeToMinutes(entry.end);

    if (
      Number.isInteger(day) &&
      day >= 0 &&
      day <= 6 &&
      startMinutes !== null &&
      endMinutes !== null &&
      endMinutes > startMinutes
    ) {
      byDay.set(day, {
        day,
        enabled: Boolean(entry.enabled),
        start: entry.start,
        end: entry.end
      });
    }
  });

  return DEFAULT_WEEKLY_SCHEDULE.map((fallback) => byDay.get(fallback.day) || fallback);
};

const sanitizeBlockNote = (value) => {
  if (typeof value !== 'string') return 'Descanso';

  return value
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 120) || 'Descanso';
};

const normalizeUnavailableBlocks = (unavailableBlocks = []) => {
  if (!Array.isArray(unavailableBlocks)) return [];

  return unavailableBlocks
    .slice(0, 100)
    .map((block) => {
      const dateKey = typeof block.date === 'string'
        ? block.date.slice(0, 10)
        : getDateKeyFromStoredDate(block.date);
      const date = parseDateKeyToUtcDate(dateKey);
      const startMinutes = parseTimeToMinutes(block.start);
      const endMinutes = parseTimeToMinutes(block.end);

      if (!date || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return null;
      }

      return {
        ...(block._id ? { _id: block._id } : {}),
        date,
        start: block.start,
        end: block.end,
        note: sanitizeBlockNote(block.note)
      };
    })
    .filter(Boolean)
    .sort((a, b) => `${toDateKey(a.date)} ${a.start}`.localeCompare(`${toDateKey(b.date)} ${b.start}`));
};

const getBusinessSettings = async () => {
  const settings = await BusinessSettings.findOneAndUpdate(
    { key: 'main' },
    { $setOnInsert: { key: 'main' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  settings.weeklySchedule = normalizeWeeklySchedule(settings.weeklySchedule);
  settings.unavailableBlocks = normalizeUnavailableBlocks(settings.unavailableBlocks);
  return settings;
};

const intervalsOverlap = (startA, endA, startB, endB) => startA < endB && startB < endA;

const toDateKey = (date) => date.toISOString().slice(0, 10);

const isPastSlotToday = ({ date, startMinutes, now = new Date() }) => {
  if (toDateKey(date) !== getBusinessDateKey(now)) {
    return false;
  }

  const currentMinutes = getBusinessMinutes(now);
  return currentMinutes !== null && startMinutes <= currentMinutes;
};

const buildSlots = (daySchedule, durationMinutes, intervalMinutes) => {
  if (!daySchedule?.enabled) return [];

  const startMinutes = parseTimeToMinutes(daySchedule.start);
  const endMinutes = parseTimeToMinutes(daySchedule.end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return [];

  const slots = [];
  for (let slotStart = startMinutes; slotStart + durationMinutes <= endMinutes; slotStart += intervalMinutes) {
    slots.push({
      time: formatMinutes(slotStart),
      startMinutes: slotStart,
      endMinutes: slotStart + durationMinutes
    });
  }

  return slots;
};

const buildUnavailableBlockIntervals = (date, unavailableBlocks = []) => {
  const dateKey = toDateKey(date);

  return unavailableBlocks
    .filter((block) => toDateKey(block.date) === dateKey)
    .map((block) => {
      const startMinutes = parseTimeToMinutes(block.start);
      const endMinutes = parseTimeToMinutes(block.end);

      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return null;
      }

      return {
        blockId: block._id,
        title: block.note || 'Descanso',
        startMinutes,
        endMinutes,
        type: 'unavailable_block'
      };
    })
    .filter(Boolean);
};

const getBlockingIntervals = async (date, options = {}) => {
  await expireUnpaidBookings();

  const dateKey = toDateKey(date);
  const excludeBookingId = options.excludeBookingId ? String(options.excludeBookingId) : null;
  const settings = options.settings || await getBusinessSettings();
  const activeBookings = await Booking.find({
    $or: [
      { status: { $in: ACTIVE_BOOKING_STATUSES }, date },
      { status: { $ne: 'cancelled' }, 'membershipSchedule.date': date }
    ]
  }).populate('service', 'title durationMinutes');

  const intervals = buildUnavailableBlockIntervals(date, settings.unavailableBlocks);

  activeBookings.forEach((booking) => {
    if (excludeBookingId && String(booking._id) === excludeBookingId) {
      return;
    }

    if (ACTIVE_BOOKING_STATUSES.includes(booking.status) && toDateKey(booking.date) === dateKey) {
      const bookingStart = parseTimeToMinutes(booking.time);
      const bookingDuration = booking.service?.durationMinutes || 60;

      if (bookingStart !== null) {
        intervals.push({
          bookingId: booking._id,
          title: booking.service?.title || 'Reserva',
          startMinutes: bookingStart,
          endMinutes: bookingStart + bookingDuration
        });
      }
    }

    booking.membershipSchedule
      .filter((visit) => visit.status === 'scheduled' && toDateKey(visit.date) === dateKey)
      .forEach((visit) => {
        const visitStart = parseTimeToMinutes(visit.time);
        const visitDuration = visit.durationMinutes || 60;

        if (visitStart !== null) {
          intervals.push({
            bookingId: booking._id,
            visitId: visit._id,
            title: visit.title,
            startMinutes: visitStart,
            endMinutes: visitStart + visitDuration
          });
        }
      });
  });

  return intervals;
};

const isSlotWithinBusinessHours = async ({ date, time, durationMinutes }) => {
  const settings = await getBusinessSettings();
  const daySchedule = settings.weeklySchedule.find((entry) => entry.day === date.getUTCDay());
  const startMinutes = parseTimeToMinutes(time);
  const businessStart = parseTimeToMinutes(daySchedule?.start);
  const businessEnd = parseTimeToMinutes(daySchedule?.end);

  if (!daySchedule?.enabled || startMinutes === null || businessStart === null || businessEnd === null) {
    return false;
  }

  return startMinutes >= businessStart && startMinutes + durationMinutes <= businessEnd;
};

const isSlotAvailable = async ({ date, time, durationMinutes, excludeBookingId = null }) => {
  const startMinutes = parseTimeToMinutes(time);
  if (startMinutes === null) return false;

  if (isPastSlotToday({ date, startMinutes })) return false;

  const settings = await getBusinessSettings();
  const daySchedule = settings.weeklySchedule.find((entry) => entry.day === date.getUTCDay());
  const businessStart = parseTimeToMinutes(daySchedule?.start);
  const businessEnd = parseTimeToMinutes(daySchedule?.end);

  const withinBusinessHours = Boolean(
    daySchedule?.enabled &&
    businessStart !== null &&
    businessEnd !== null &&
    startMinutes >= businessStart &&
    startMinutes + durationMinutes <= businessEnd
  );
  if (!withinBusinessHours) return false;

  const blockingIntervals = await getBlockingIntervals(date, { excludeBookingId, settings });
  return !blockingIntervals.some((interval) => intervalsOverlap(
    startMinutes,
    startMinutes + durationMinutes,
    interval.startMinutes,
    interval.endMinutes
  ));
};

const addDaysUtc = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  next.setUTCHours(0, 0, 0, 0);
  return next;
};

const findNextAvailableDate = async ({ preferredDate, time, durationMinutes, maxDays = 14, excludeBookingId = null }) => {
  for (let offset = 0; offset <= maxDays; offset += 1) {
    const date = addDaysUtc(preferredDate, offset);
    if (await isSlotAvailable({ date, time, durationMinutes, excludeBookingId })) {
      return date;
    }
  }

  return null;
};

const getAvailabilityForService = async ({ serviceId, date, excludeBookingId = null }) => {
  await expireUnpaidBookings();

  const service = await Service.findById(serviceId).select('title durationMinutes');
  if (!service) {
    return { service: null, slots: [] };
  }

  const settings = await getBusinessSettings();
  const daySchedule = settings.weeklySchedule.find((entry) => entry.day === date.getUTCDay());
  const durationMinutes = service.durationMinutes || 60;
  const intervalMinutes = settings.slotIntervalMinutes || 30;
  const slots = buildSlots(daySchedule, durationMinutes, intervalMinutes);

  const blockingIntervals = await getBlockingIntervals(date, { excludeBookingId, settings });

  const availability = slots.map((slot) => {
    const isPast = isPastSlotToday({ date, startMinutes: slot.startMinutes });
    const blockingInterval = blockingIntervals.find((interval) => (
      intervalsOverlap(
        slot.startMinutes,
        slot.endMinutes,
        interval.startMinutes,
        interval.endMinutes
      )
    ));

    return {
      time: slot.time,
      available: !isPast && !blockingInterval,
      durationMinutes,
      blockedBy: blockingInterval ? (blockingInterval.bookingId || blockingInterval.blockId) : null,
      blockedTitle: isPast ? 'Horario pasado' : blockingInterval ? blockingInterval.title : null
    };
  });

  return {
    service: {
      id: service._id,
      title: service.title,
      durationMinutes
    },
    daySchedule,
    slotIntervalMinutes: intervalMinutes,
    slots: availability
  };
};

module.exports = {
  ACTIVE_BOOKING_STATUSES,
  DEFAULT_WEEKLY_SCHEDULE,
  addDaysUtc,
  buildSlots,
  findNextAvailableDate,
  getAvailabilityForService,
  getBusinessSettings,
  getBlockingIntervals,
  intervalsOverlap,
  isSlotAvailable,
  isPastSlotToday,
  isValidTime,
  normalizeUnavailableBlocks,
  normalizeWeeklySchedule,
  parseTimeToMinutes
};
