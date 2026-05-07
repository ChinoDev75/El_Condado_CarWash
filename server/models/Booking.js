const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  customerName: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ''
  },
  customerPhone: {
    type: String,
    trim: true,
    maxlength: 30,
    default: ''
  },
  customerEmail: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 254,
    default: ''
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: [true, 'Por favor agrega una fecha'],
    index: true
  },
  time: {
    type: String,
    required: [true, 'Por favor agrega una hora'],
    match: [/^\d{2}:\d{2}$/, 'Hora invalida']
  },
  plate: {
    type: String,
    required: [true, 'Por favor agrega la placa del vehiculo'],
    trim: true,
    uppercase: true,
    maxlength: 12
  },
  status: {
    type: String,
    enum: ['awaiting_payment', 'pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid', 'failed'],
    default: 'unpaid',
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'cash', 'transfer'],
    default: 'card',
    index: true
  },
  subtotalCents: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentFeeCents: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCents: {
    type: Number,
    default: 0,
    min: 0
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true
  },
  source: {
    type: String,
    enum: ['web', 'admin'],
    default: 'web',
    index: true
  },
  recurrenteCheckoutId: {
    type: String,
    default: null,
    index: true
  },
  recurrenteEventId: {
    type: String,
    default: null
  },
  paidAt: {
    type: Date,
    default: null
  },
  pointsAwarded: {
    type: Boolean,
    default: false
  },
  loyaltyPointsAwarded: {
    type: Number,
    default: 0,
    min: 0
  },
  membershipPlan: {
    type: String,
    enum: ['none', 'monthly', 'quarterly'],
    default: 'none'
  },
  membershipSchedule: [{
    date: {
      type: Date,
      required: true,
      index: true
    },
    time: {
      type: String,
      required: true,
      match: [/^\d{2}:\d{2}$/, 'Hora invalida']
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    durationMinutes: {
      type: Number,
      default: 60,
      min: 15,
      max: 480
    },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled'
    }
  }],
  internalNotes: {
    type: String,
    default: '',
    maxlength: 500
  }
}, {
  timestamps: true
});

bookingSchema.index(
  { date: 1, time: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['awaiting_payment', 'pending', 'confirmed'] } }
  }
);

module.exports = mongoose.model('Booking', bookingSchema);
