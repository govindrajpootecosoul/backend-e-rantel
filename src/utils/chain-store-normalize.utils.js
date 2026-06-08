const {
  formatUpc,
  parseNumericField,
  NUMERIC_FIELDS,
} = require('./kehe-columns');

/** Canonical camelCase field → possible MongoDB keys (camel + snake). */
const CHAIN_STORE_FIELD_ALIASES = {
  fileMonth: ['fileMonth', 'file_month'],
  retailer: ['retailer'],
  retailerArea: ['retailerArea', 'retailer_area'],
  productDescription: ['productDescription', 'product_description'],
  fillRateVendorCost: ['fillRateVendorCost', 'fill_rate_vendor_cost'],
  orderedVendorCost: ['orderedVendorCost', 'ordered_vendor_cost'],
  shippedVendorCost: ['shippedVendorCost', 'shipped_vendor_cost'],
  upc: ['upc'],
  fillRateQuantity: ['fillRateQuantity', 'fill_rate_quantity'],
  orderedQuantity: ['orderedQuantity', 'ordered_quantity'],
  shippedQuantity: ['shippedQuantity', 'shipped_quantity'],
  fillRateListWholesale: ['fillRateListWholesale', 'fill_rate_list_wholesale'],
  orderedListWholesale: ['orderedListWholesale', 'ordered_list_wholesale'],
  shippedListWholesale: ['shippedListWholesale', 'shipped_list_wholesale'],
  sku: ['sku'],
  boxPerCase: ['boxPerCase', 'box_per_case'],
  material: ['material'],
  productCategory: ['productCategory', 'product_category'],
  productSubCategory: ['productSubCategory', 'product_sub_category'],
  productType: ['productType', 'product_type'],
  orderedCaseCostVendorCost: ['orderedCaseCostVendorCost', 'ordered_case_cost_vendor_cost'],
  orderedCaseCostListWholesale: [
    'orderedCaseCostListWholesale',
    'ordered_case_cost_list_wholesale',
  ],
  markup: ['markup'],
  importBatchId: ['importBatchId', 'import_batch_id'],
  sourceFileName: ['sourceFileName', 'source_file_name'],
  updatedAt: ['updatedAt', 'updated_at'],
  createdAt: ['createdAt', 'created_at'],
};

const NUMERIC_CANONICAL_FIELDS = NUMERIC_FIELDS;

const pickRawField = (doc, canonicalKey) => {
  const aliases = CHAIN_STORE_FIELD_ALIASES[canonicalKey];
  if (!aliases) return doc[canonicalKey];
  for (const alias of aliases) {
    const value = doc[alias];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const normalizeFieldValue = (canonicalKey, raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return NUMERIC_CANONICAL_FIELDS.has(canonicalKey) ? null : '';
  }
  if (canonicalKey === 'upc') return formatUpc(raw);
  if (NUMERIC_CANONICAL_FIELDS.has(canonicalKey)) return parseNumericField(canonicalKey, raw);
  return String(raw).trim();
};

const normalizeChainStoreRow = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;

  const row = { _id: doc._id };

  for (const canonicalKey of Object.keys(CHAIN_STORE_FIELD_ALIASES)) {
    if (canonicalKey === 'updatedAt' || canonicalKey === 'createdAt') continue;
    const raw = pickRawField(doc, canonicalKey);
    const normalized = normalizeFieldValue(canonicalKey, raw);
    if (normalized !== undefined && normalized !== null && normalized !== '') {
      row[canonicalKey] = normalized;
    } else if (NUMERIC_CANONICAL_FIELDS.has(canonicalKey) && normalized === null) {
      row[canonicalKey] = null;
    }
  }

  if (doc.updatedAt) row.updatedAt = doc.updatedAt;
  if (doc.createdAt) row.createdAt = doc.createdAt;

  return row;
};

const normalizeChainStoreRows = (docs) => (docs || []).map(normalizeChainStoreRow);

const buildCoalesceExpr = (aliases) => {
  if (!aliases?.length) return null;
  if (aliases.length === 1) return `$${aliases[0]}`;
  return aliases.slice(1).reduce((acc, alias) => ({ $ifNull: [`$${alias}`, acc] }), null);
};

const normalizeFieldsStage = {
  $addFields: Object.fromEntries(
    Object.entries(CHAIN_STORE_FIELD_ALIASES)
      .filter(([key]) => key !== 'updatedAt' && key !== 'createdAt')
      .map(([canonicalKey, aliases]) => [canonicalKey, buildCoalesceExpr(aliases)])
  ),
};

const toDoubleExpr = (fieldPath) => ({
  $convert: {
    input: {
      $replaceAll: {
        input: {
          $replaceAll: {
            input: { $trim: { input: { $toString: { $ifNull: [fieldPath, '0'] } } } },
            find: ',',
            replacement: '',
          },
        },
        find: '$',
        replacement: '',
      },
    },
    to: 'double',
    onError: 0,
    onNull: 0,
  },
});

const numericFieldsStage = {
  $addFields: Object.fromEntries(
    [...NUMERIC_CANONICAL_FIELDS].map((field) => [field, toDoubleExpr(`$${field}`)])
  ),
};

const chainStorePipelinePrefix = (filters = {}) => {
  const { buildMatchStage } = require('./kehe-filters.utils');
  const stages = [];
  const match = buildMatchStage(filters);
  if (match) stages.push(match);
  stages.push(normalizeFieldsStage, numericFieldsStage);
  return stages;
};

const buildDbFieldMatch = (canonicalKey, value) => {
  const aliases = CHAIN_STORE_FIELD_ALIASES[canonicalKey] || [canonicalKey];
  if (aliases.length === 1) return { [aliases[0]]: value };
  return { $or: aliases.map((alias) => ({ [alias]: value })) };
};

const mergeDistinctAliases = async (Model, canonicalKey) => {
  const aliases = CHAIN_STORE_FIELD_ALIASES[canonicalKey] || [canonicalKey];
  const lists = await Promise.all(aliases.map((field) => Model.distinct(field).lean()));
  return [...new Set(lists.flat().filter((v) => v !== undefined && v !== null && v !== ''))];
};

module.exports = {
  CHAIN_STORE_FIELD_ALIASES,
  normalizeChainStoreRow,
  normalizeChainStoreRows,
  normalizeFieldsStage,
  numericFieldsStage,
  chainStorePipelinePrefix,
  buildDbFieldMatch,
  mergeDistinctAliases,
  toDoubleExpr,
};
