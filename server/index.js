const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const {
  validateEnv,
  securityHeaders,
  corsOptions,
  getDatabaseStatus,
  requireDatabaseConnection,
  notFound,
  errorHandler
} = require('./middleware/security');

const app = express();

validateEnv();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Connect to MongoDB
mongoose.set('bufferCommands', false);
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Middleware
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({
  limit: '100kb',
  verify: (req, res, buffer) => {
    req.rawBody = buffer.toString('utf8');
  }
}));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'El Condado CarWash API',
    database: getDatabaseStatus(mongoose.connection)
  });
});

app.get('/api/health', (req, res) => {
  const database = getDatabaseStatus(mongoose.connection);
  res.status(database.readyState === 1 ? 200 : 503).json({
    status: database.readyState === 1 ? 'ok' : 'degraded',
    database
  });
});

app.use('/api', requireDatabaseConnection(mongoose.connection));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/services', require('./routes/services'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/loyalty', require('./routes/loyalty'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/settings', require('./routes/settings'));

app.use(notFound);
app.use(errorHandler);

// Port
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
