let requestCount = 0;

const isEnabled = () => process.env.API_REQUEST_LOG !== 'false';

const skipHealth = () => process.env.API_REQUEST_LOG_SKIP_HEALTH !== 'false';

const requestLogMiddleware = (req, res, next) => {
  if (!isEnabled()) return next();

  const path = req.originalUrl || req.url || '';
  if (!path.startsWith('/api')) return next();
  if (skipHealth() && path.startsWith('/api/health')) return next();

  const start = Date.now();
  requestCount += 1;
  const id = requestCount;

  res.on('finish', () => {
    const ms = Date.now() - start;
    const time = new Date().toISOString().slice(11, 19);
    const status = res.statusCode;
    const mark = status >= 400 ? '!' : ' ';
    console.log(
      `[API #${id}]${mark} ${time} ${req.method} ${path} → ${status} (${ms}ms)`
    );
  });

  next();
};

module.exports = requestLogMiddleware;
