const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth.routes');
const executiveRoutes = require('./routes/executive.routes');
const spsRoutes = require('./routes/sps.routes');
const poTrackerRoutes = require('./routes/po-tracker.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const usersRoutes = require('./routes/users.routes');
const storesKeheRoutes = require('./routes/stores-kehe.routes');
const storesSproutsRoutes = require('./routes/stores-sprouts.routes');
const { apiLimiter } = require('./middleware/security.middleware');

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5011')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(compression());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, !isProduction);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'Retail Central API' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/executive', executiveRoutes);
app.use('/api/v1/sps', spsRoutes);
app.use('/api/v1/po-tracker', poTrackerRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/stores/kehe', storesKeheRoutes);
app.use('/api/v1/stores/sprouts', storesSproutsRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err?.message?.includes('files are allowed')) {
    return res.status(400).json({ success: false, message: err.message });
  }
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

module.exports = app;
