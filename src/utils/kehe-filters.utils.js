const FILTER_KEYS = ['fileMonth', 'retailer', 'retailerArea', 'sku', 'upc', 'material'];

const parseFiltersFromQuery = (query) => {
  const filters = {};
  for (const key of FILTER_KEYS) {
    const value = query[key];
    if (value && value !== 'All') filters[key] = String(value);
  }
  return filters;
};

const buildMatchStage = (filters = {}) => {
  const match = {};
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value && value !== 'All') {
      match[key] = value;
    }
  }
  return Object.keys(match).length ? { $match: match } : null;
};

const parsePage = (value, fallback = 1) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const parseLimit = (value, fallback = 25) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 200);
};

module.exports = {
  FILTER_KEYS,
  parseFiltersFromQuery,
  buildMatchStage,
  parsePage,
  parseLimit,
};
