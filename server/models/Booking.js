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
  customerAddress: {
    type: String,
    trim: true,
    maxlength: 220,
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
  vehiclePlates: [{
    type: String,
    trim: true,
    uppercase: true,
    maxlength: 12
  }],
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
  washMode: {
    type: String,
    enum: ['at_home', 'drop_off', 'pickup_and_return'],
    default: null,
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
  referral: {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 24,
      default: ''
    },
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    discountRatePercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    discountCents: {
      type: Number,
      min: 0,
      default: 0
    },
    rewardPoints: {
      type: Number,
      min: 0,
      default: 0
    },
    rewardAwarded: {
      type: Boolean,
      default: false
    },
    rewardAwardedAt: {
      type: Date,
      default: null
    }
  },
  membershipPlan: {
    type: String,
    enum: ['none', 'monthly', 'quarterly', 'custom'],
    default: 'none'
  },
  customMembership: {
    planName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ''
    },
    washCount: {
      type: Number,
      min: 0,
      max: 52,
      default: 0
    },
    originalSubtotalCents: {
      type: Number,
      min: 0,
      default: 0
    },
    discountRatePercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    discountCents: {
      type: Number,
      min: 0,
      default: 0
    },
    discountedSubtotalCents: {
      type: Number,
      min: 0,
      default: 0
    },
    carTier: {
      type: String,
      enum: ['individual', 'duo', 'trio', 'four_plus', null],
      default: null
    },
    carCount: {
      type: Number,
      min: 0,
      max: 12,
      default: 0
    },
    washServiceTitle: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ''
    },
    firstVisitServiceTitle: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ''
    },
    firstVisitDurationMinutes: {
      type: Number,
      min: 15,
      max: 480,
      default: 60
    },
    firstVisitSubtotalCents: {
      type: Number,
      min: 0,
      default: 0
    },
    pricePerCarWashCents: {
      type: Number,
      min: 0,
      default: 0
    },
    durationPerVisitMinutes: {
      type: Number,
      min: 15,
      max: 480,
      default: 60
    },
    serviceBreakdown: [{
      service: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        default: null
      },
      title: {
        type: String,
        trim: true,
        maxlength: 120,
        default: ''
      },
      category: {
        type: String,
        trim: true,
        maxlength: 30,
        default: ''
      },
      visits: {
        type: Number,
        min: 0,
        default: 0
      },
      carWashes: {
        type: Number,
        min: 0,
        default: 0
      },
      subtotalCents: {
        type: Number,
        min: 0,
        default: 0
      }
    }]
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
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null
    },
    serviceTitle: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ''
    },
    serviceCategory: {
      type: String,
      trim: true,
      maxlength: 30,
      default: ''
    },
    subtotalCents: {
      type: Number,
      min: 0,
      default: 0
    },
    durationMinutes: {
      type: Number,
      default: 60,
      min: 15,
      max: 480
    },
    vehiclePlates: [{
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 12
    }],
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
