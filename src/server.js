require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5010;

const validateEnv = () => {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret) {
    console.error('JWT_SECRET must be set before starting the API.');
    process.exit(1);
  }

  if (isProduction && secret.length < 32) {
    console.error(
      'JWT_SECRET must be at least 32 characters in production.'
    );
    process.exit(1);
  }

  if (isProduction && !process.env.CORS_ORIGIN) {
    console.error('CORS_ORIGIN must be set in production (your frontend URL).');
    process.exit(1);
  }
};

const start = async () => {
  try {
    validateEnv();
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`Retail Central API running on port ${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `Port ${PORT} is already in use. Stop the other process, then retry:\n` +
            `  Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`
        );
        process.exit(1);
      }
      console.error('Server error:', err.message);
      process.exit(1);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

start();
