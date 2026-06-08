const { buildDbFieldMatch } = require('./chain-store-normalize.utils');

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
  const conditions = [];
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value && value !== 'All') {
      conditions.push(buildDbFieldMatch(key, value));
    }
  }
  if (conditions.length === 0) return null;
  if (conditions.length === 1) return { $match: conditions[0] };
  return { $match: { $and: conditions } };
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
