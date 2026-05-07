const mongoose = require('mongoose');

const pricePattern = /^Q?\s?\d+(\.\d{1,2})?$/;

const serviceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  price: {
    type: String,
    required: true,
    trim: true,
    match: [pricePattern, 'Precio invalido']
  },
  durationMinutes: {
    type: Number,
    default: 60,
    min: 15,
    max: 480
  },
  oldPrice: {
    type: String,
    default: null,
    trim: true,
    match: [pricePattern, 'Precio anterior invalido']
  },
  description: {
    type: String,
    default: '',
    maxlength: 500
  },
  features: [{
    type: String,
    trim: true,
    maxlength: 160
  }],
  category: {
    type: String,
    required: true,
    enum: ['lavado', 'promo', 'membresia', 'extra'],
    index: true
  },
  tag: {
    type: String,
    default: null,
    trim: true,
    maxlength: 40
  },
  iconName: {
    type: String,
    default: 'IconCar',
    trim: true,
    maxlength: 40
  },
  recurrenteProductId: {
    type: String,
    default: null,
    trim: true,
    maxlength: 120
  },
  waMsg: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  isTrimestral: {
    type: Boolean,
    default: false
  },
  period: {
    type: String,
    default: null,
    trim: true,
    maxlength: 40
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Service', serviceSchema);
