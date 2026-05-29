const DEFAULT_TTL_MS = Number(process.env.EXECUTIVE_CACHE_TTL_MS) || 5 * 60 * 1000;

let payload = null;
let expiresAt = 0;

const get = () => {
  if (!payload || Date.now() >= expiresAt) return null;
  return payload;
};

const set = (data, ttlMs = DEFAULT_TTL_MS) => {
  payload = data;
  expiresAt = Date.now() + ttlMs;
};

const invalidate = () => {
  payload = null;
  expiresAt = 0;
};

module.exports = { get, set, invalidate, DEFAULT_TTL_MS };
