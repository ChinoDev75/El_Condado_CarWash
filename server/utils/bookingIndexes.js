const Booking = require('../models/Booking');

const SLOT_INDEX_NAME = 'date_1_time_1';
const SLOT_INDEX_KEY = { date: 1, time: 1 };
const SLOT_INDEX_PARTIAL = { status: { $in: ['pending', 'confirmed'] } };

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const findSlotIndex = (indexes) => indexes.find((index) => (
  index.name === SLOT_INDEX_NAME ||
  sameJson(index.key, SLOT_INDEX_KEY)
));

const ensureBookingSlotIndex = async () => {
  try {
    const indexes = await Booking.collection.indexes();
    const slotIndex = findSlotIndex(indexes);
    const desiredOptions = {
      unique: true,
      partialFilterExpression: SLOT_INDEX_PARTIAL,
      name: SLOT_INDEX_NAME
    };

    if (
      slotIndex &&
      slotIndex.unique &&
      sameJson(slotIndex.partialFilterExpression, SLOT_INDEX_PARTIAL)
    ) {
      return;
    }

    if (slotIndex) {
      await Booking.collection.dropIndex(slotIndex.name);
    }

    await Booking.collection.createIndex(SLOT_INDEX_KEY, desiredOptions);
  } catch (error) {
    console.error('No se pudo sincronizar el indice de horarios:', error.message);
  }
};

module.exports = { ensureBookingSlotIndex };
