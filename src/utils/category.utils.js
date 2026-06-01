/** Legacy `costco` maps to Waitrose everywhere category/store is resolved. */
const normalizeCategoryKey = (value) => {
  const key = String(value || '').toLowerCase().trim();
  if (key === 'costco') return 'waitrose';
  if (key === 'waitrose' || key === 'sps') return key;
  return key;
};

const formatCategoryLabel = (value) => {
  if (!value || value === 'All') return value;
  const key = String(value).toLowerCase().trim();
  if (key === 'costco' || key === 'waitrose') return 'Waitrose';
  if (key === 'sps') return 'SPS';
  return String(value);
};

const categoryKeysMatch = (a, b) =>
  normalizeCategoryKey(a) === normalizeCategoryKey(b);

module.exports = {
  normalizeCategoryKey,
  formatCategoryLabel,
  categoryKeysMatch,
};
