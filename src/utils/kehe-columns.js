/** Canonical field keys for KeHE chain store rows */
const KEHE_CHAIN_STORE_FIELDS = [
  'fileMonth',
  'retailer',
  'retailerArea',
  'productDescription',
  'fillRateVendorCost',
  'orderedVendorCost',
  'shippedVendorCost',
  'upc',
  'fillRateQuantity',
  'orderedQuantity',
  'shippedQuantity',
  'fillRateListWholesale',
  'orderedListWholesale',
  'shippedListWholesale',
  'sku',
  'boxPerCase',
  'material',
  'productCategory',
  'productSubCategory',
  'productType',
  'orderedCaseCostVendorCost',
  'orderedCaseCostListWholesale',
  'markup',
];

const FILL_RATE_PERCENT_FIELDS = new Set([
  'fillRateVendorCost',
  'fillRateListWholesale',
]);

const FILL_RATE_RATIO_FIELDS = new Set(['fillRateQuantity']);

const NUMERIC_FIELDS = new Set([
  'fillRateVendorCost',
  'orderedVendorCost',
  'shippedVendorCost',
  'fillRateQuantity',
  'orderedQuantity',
  'shippedQuantity',
  'fillRateListWholesale',
  'orderedListWholesale',
  'shippedListWholesale',
  'boxPerCase',
  'orderedCaseCostVendorCost',
  'orderedCaseCostListWholesale',
  'markup',
]);

const normalizeHeaderKey = (raw) =>
  String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[%()]/g, '')
    .replace(/[\s./-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

/** Maps normalized spreadsheet headers → schema field */
const HEADER_ALIASES = {
  file_month: 'fileMonth',
  month_year: 'fileMonth',
  month_and_year: 'fileMonth',
  retailer: 'retailer',
  retailer_area: 'retailerArea',
  product_description: 'productDescription',
  fill_rate_vendor_cost: 'fillRateVendorCost',
  ordered_vendor_cost: 'orderedVendorCost',
  shipped_vendor_cost: 'shippedVendorCost',
  upc: 'upc',
  fill_rate_quantity: 'fillRateQuantity',
  ordered_quantity: 'orderedQuantity',
  shipped_quantity: 'shippedQuantity',
  fill_rate_list_wholesale: 'fillRateListWholesale',
  ordered_list_wholesale: 'orderedListWholesale',
  shipped_list_wholesale: 'shippedListWholesale',
  sku: 'sku',
  box_per_case: 'boxPerCase',
  material: 'material',
  product_category: 'productCategory',
  product_sub_category: 'productSubCategory',
  product_type: 'productType',
  ordered_case_cost_vendor_cost: 'orderedCaseCostVendorCost',
  ordered_case_cost_list_wholesale: 'orderedCaseCostListWholesale',
  ordered_case_cost_listwholesale: 'orderedCaseCostListWholesale',
  markup: 'markup',
};

/** UPC / GTIN — keep full digits (Excel often uses scientific notation). */
const formatUpc = (value) => {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (Math.abs(rounded) >= 1e10) {
      try {
        return BigInt(rounded).toString();
      } catch {
        return String(rounded);
      }
    }
    return String(rounded);
  }

  const s = String(value).trim();
  if (/^[\d.]+[eE][+\-]?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const rounded = Math.round(n);
      try {
        return BigInt(rounded).toString();
      } catch {
        return String(rounded);
      }
    }
  }

  return s;
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value)
    .replace(/[$,\s]/g, '')
    .replace(/%/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/** "100.00 %", "66.67 %" → 0–100 */
const parseFillRatePercent = (value) => {
  const raw = String(value ?? '').trim();
  const hasPercent = raw.includes('%');
  const n = parseNumber(value);
  if (n === null) return null;
  if (hasPercent || n > 1) return n;
  return n * 100;
};

/** Quantity fill rate: 0–1 ratio (0.6667) or percent string */
const parseFillRateRatio = (value) => {
  const raw = String(value ?? '').trim();
  const hasPercent = raw.includes('%');
  const n = parseNumber(value);
  if (n === null) return null;
  if (hasPercent || n > 1) return n / 100;
  return n;
};

const parseNumericField = (field, value) => {
  if (FILL_RATE_PERCENT_FIELDS.has(field)) return parseFillRatePercent(value);
  if (FILL_RATE_RATIO_FIELDS.has(field)) return parseFillRateRatio(value);
  return parseNumber(value);
};

const mapHeaderToField = (header) => {
  const key = normalizeHeaderKey(header);
  return HEADER_ALIASES[key] || null;
};

const rowFromRecord = (record) => {
  const doc = {};
  for (const [header, value] of Object.entries(record)) {
    const field = mapHeaderToField(header);
    if (!field) continue;

    if (field === 'upc') {
      doc[field] = formatUpc(value);
      continue;
    }

    if (NUMERIC_FIELDS.has(field)) {
      doc[field] = parseNumericField(field, value);
    } else {
      const str = value === null || value === undefined ? '' : String(value).trim();
      doc[field] = str;
    }
  }
  return doc;
};

const hasMinimumData = (doc) =>
  Boolean(doc.fileMonth || doc.retailer || doc.sku || doc.upc || doc.orderedVendorCost);

module.exports = {
  KEHE_CHAIN_STORE_FIELDS,
  NUMERIC_FIELDS,
  normalizeHeaderKey,
  mapHeaderToField,
  rowFromRecord,
  hasMinimumData,
  parseNumber,
  formatUpc,
};
