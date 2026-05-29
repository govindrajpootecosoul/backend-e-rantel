const FILTER_KEYS = ['reportMonth', 'sku', 'dc', 'material', 'upc'];

const parseRiskFiltersFromQuery = (query) => {
  const filters = {};
  for (const key of FILTER_KEYS) {
    const value = query[key];
    if (value && value !== 'All') filters[key] = String(value);
  }
  return filters;
};

const buildRiskMatch = (filters = {}) => {
  const match = {};
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value && value !== 'All') match[key] = value;
  }
  return match;
};

module.exports = {
  FILTER_KEYS,
  parseRiskFiltersFromQuery,
  buildRiskMatch,
};
