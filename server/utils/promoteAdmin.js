const mongoose = require('mongoose');
const User = require('../models/User');
const { normalizeEmail, isValidEmail } = require('./validation');
require('dotenv').config();

const promoteToAdmin = async (email) => {
  try {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      console.log('Correo invalido.');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB...');

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { role: 'admin' },
      { new: true }
    );

    if (user) {
      console.log(`✅ ÉXITO: El usuario ${user.email} ahora es ADMIN.`);
    } else {
      console.log('❌ ERROR: No se encontró ningún usuario con ese correo. Regístrate primero en la web.');
    }

    process.exit();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

// Obtener el correo desde los argumentos de la terminal
const emailArg = process.argv[2];
if (!emailArg) {
  console.log('Por favor proporciona un correo: node createAdmin.js tu@correo.com');
  process.exit();
}

promoteToAdmin(emailArg);
