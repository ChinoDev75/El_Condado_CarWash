const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
    index: true
  },
  rating: {
    type: Number,
    required: [true, 'Por favor agrega una calificacion entre 1 y 5'],
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: [true, 'Por favor agrega un comentario'],
    trim: true,
    minlength: 5,
    maxlength: 500
  }
}, {
  timestamps: true
});

reviewSchema.index({ user: 1, service: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
