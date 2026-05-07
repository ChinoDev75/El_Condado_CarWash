const mongoose = require('mongoose');

const dayScheduleSchema = new mongoose.Schema({
  day: {
    type: Number,
    min: 0,
    max: 6,
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  start: {
    type: String,
    required: true,
    match: [/^\d{2}:\d{2}$/, 'Hora inicial invalida']
  },
  end: {
    type: String,
    required: true,
    match: [/^\d{2}:\d{2}$/, 'Hora final invalida']
  }
}, { _id: false });

const transferAccountSchema = new mongoose.Schema({
  bankName: {
    type: String,
    trim: true,
    maxlength: 80,
    default: 'Configura tu banco'
  },
  accountName: {
    type: String,
    trim: true,
    maxlength: 120,
    default: 'El Condado CarWash'
  },
  accountNumber: {
    type: String,
    trim: true,
    maxlength: 60,
    default: 'Configura tu numero de cuenta'
  },
  accountType: {
    type: String,
    trim: true,
    maxlength: 60,
    default: 'Monetaria'
  },
  instructions: {
    type: String,
    trim: true,
    maxlength: 300,
    default: 'Despues de transferir, envia el comprobante por WhatsApp para confirmar tu reserva.'
  }
}, { _id: false });

const businessSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'main',
    unique: true
  },
  weeklySchedule: {
    type: [dayScheduleSchema],
    default: () => ([
      { day: 0, enabled: false, start: '08:00', end: '17:00' },
      { day: 1, enabled: true, start: '08:00', end: '17:00' },
      { day: 2, enabled: true, start: '08:00', end: '17:00' },
      { day: 3, enabled: true, start: '08:00', end: '17:00' },
      { day: 4, enabled: true, start: '08:00', end: '17:00' },
      { day: 5, enabled: true, start: '08:00', end: '17:00' },
      { day: 6, enabled: true, start: '08:00', end: '14:00' }
    ])
  },
  slotIntervalMinutes: {
    type: Number,
    default: 30,
    min: 15,
    max: 240
  },
  transferAccount: {
    type: transferAccountSchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('BusinessSettings', businessSettingsSchema);
