const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Por favor agrega un nombre'],
    trim: true,
    maxlength: 80
  },
  email: {
    type: String,
    required: [true, 'Por favor agrega un correo'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
      'Por favor agrega un correo valido'
    ]
  },
  phone: {
    type: String,
    trim: true,
    maxlength: 30,
    default: ''
  },
  address: {
    type: String,
    trim: true,
    maxlength: 220,
    default: ''
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true,
    maxlength: 16,
    index: true
  },
  password: {
    type: String,
    required: [true, 'Por favor agrega una contraseña'],
    minlength: 10,
    maxlength: 128,
    select: false
  },
  role: {
    type: String,
    enum: ['client', 'admin'],
    default: 'client'
  },
  loyalty_points: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
});

userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
