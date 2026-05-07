const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];

const parseOrigins = () => {
  const source = process.env.CORS_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173';
  return source.split(',').map((origin) => origin.trim()).filter(Boolean);
};

exports.validateEnv = () => {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Variables de entorno faltantes: ${missing.join(', ')}`);
  }

  if (process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === 'supersecretkey123') {
    throw new Error('JWT_SECRET debe ser un valor privado y robusto de al menos 32 caracteres.');
  }

  if (process.env.NODE_ENV === 'production' && !process.env.RECURRENTE_WEBHOOK_SECRET) {
    throw new Error('RECURRENTE_WEBHOOK_SECRET es obligatorio en produccion.');
  }
};

exports.securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
};

const databaseStates = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

exports.getDatabaseStatus = (mongooseConnection) => ({
  readyState: mongooseConnection.readyState,
  state: databaseStates[mongooseConnection.readyState] || 'unknown'
});

exports.requireDatabaseConnection = (mongooseConnection) => (req, res, next) => {
  if (mongooseConnection.readyState === 1) {
    return next();
  }

  return res.status(503).json({
    message: 'Base de datos no conectada. Revisa MONGODB_URI y permisos de red en MongoDB Atlas.',
    database: exports.getDatabaseStatus(mongooseConnection)
  });
};

exports.corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = parseOrigins();
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret', 'X-Recurrente-Webhook-Secret'],
  optionsSuccessStatus: 204
};

exports.notFound = (req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
};

exports.errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err.message === 'Origen no permitido por CORS') {
    return res.status(403).json({ message: 'Origen no permitido' });
  }

  console.error(err);
  return res.status(500).json({ message: 'Error interno del servidor' });
};
