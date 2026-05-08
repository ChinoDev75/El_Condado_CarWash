const mongoose = require('mongoose');

const clientInviteSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 30,
    index: true
  },
  address: {
    type: String,
    required: true,
    trim: true,
    maxlength: 220
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
    select: false
  },
  tokenExpiresAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'claimed', 'cancelled'],
    default: 'pending',
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  claimedAt: {
    type: Date,
    default: null
  },
  lastInviteUrl: {
    type: String,
    default: '',
    maxlength: 500
  },
  lastWhatsappUrl: {
    type: String,
    default: '',
    maxlength: 800
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ClientInvite', clientInviteSchema);
