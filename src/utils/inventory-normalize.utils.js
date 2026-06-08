const {
  HEADER_ALIASES,
  NUMERIC_FIELDS,
  parseReportMonth,
  computeInventoryAgeDays,
  bucketIdForAgeDays,
} = require('./kehe-inventory-columns');
const { formatUpc, parseNumber } = require('./kehe-columns');

const INVENTORY_FIELD_ALIASES = {};

for (const [alias, canonical] of Object.entries(HEADER_ALIASES)) {
  if (!INVENTORY_FIELD_ALIASES[canonical]) INVENTORY_FIELD_ALIASES[canonical] = [];
  if (!INVENTORY_FIELD_ALIASES[canonical].includes(canonical)) {
    INVENTORY_FIELD_ALIASES[canonical].push(canonical);
  }
  if (!INVENTORY_FIELD_ALIASES[canonical].includes(alias)) {
    INVENTORY_FIELD_ALIASES[canonical].push(alias);
  }
}

INVENTORY_FIELD_ALIASES.reportMonth = ['reportMonth', 'report_month'];
INVENTORY_FIELD_ALIASES.inventoryAgeDays = ['inventoryAgeDays', 'inventory_age_days'];
INVENTORY_FIELD_ALIASES.agingBucket = ['agingBucket', 'aging_bucket'];
INVENTORY_FIELD_ALIASES.vendorCost = ['vendorCost', 'vendor_cost'];

const pickRawField = (doc, canonicalKey) => {
  const aliases = INVENTORY_FIELD_ALIASES[canonicalKey];
  if (!aliases) return doc[canonicalKey];
  for (const alias of aliases) {
    const value = doc[alias];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const normalizeFieldValue = (canonicalKey, raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return NUMERIC_FIELDS.has(canonicalKey) ? null : '';
  }
  if (canonicalKey === 'upc') return formatUpc(raw);
  if (NUMERIC_FIELDS.has(canonicalKey)) return parseNumber(raw);
  return String(raw).trim();
};

const normalizeInventoryRow = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;

  const row = { _id: doc._id };

  for (const canonicalKey of Object.keys(INVENTORY_FIELD_ALIASES)) {
    if (canonicalKey === 'reportMonth' || canonicalKey === 'inventoryAgeDays' || canonicalKey === 'agingBucket') {
      continue;
    }
    const raw = pickRawField(doc, canonicalKey);
    const normalized = normalizeFieldValue(canonicalKey, raw);
    if (normalized !== undefined && normalized !== null && normalized !== '') {
      row[canonicalKey] = normalized;
    } else if (NUMERIC_FIELDS.has(canonicalKey) && normalized === null) {
      row[canonicalKey] = null;
    }
  }

  if (!row.boxPerCase && row.vendorCasePack) row.boxPerCase = row.vendorCasePack;

  const storedReportMonth = pickRawField(doc, 'reportMonth');
  row.reportMonth = storedReportMonth
    ? String(storedReportMonth).trim()
    : parseReportMonth(row.downloadedOn);

  row.inventoryAgeDays = computeInventoryAgeDays(row);
  row.agingBucket = bucketIdForAgeDays(row.inventoryAgeDays);

  if (doc.updatedAt) row.updatedAt = doc.updatedAt;
  if (doc.createdAt) row.createdAt = doc.createdAt;

  return row;
};

const normalizeInventoryRows = (docs) => (docs || []).map(normalizeInventoryRow);

const filterByReportMonth = (rows, reportMonth) => {
  if (!reportMonth || reportMonth === 'All') return rows;
  return rows.filter((row) => row.reportMonth === reportMonth);
};

const collectReportMonths = (rows) =>
  [...new Set(rows.map((row) => row.reportMonth).filter(Boolean))].sort((a, b) =>
    String(b).localeCompare(String(a))
  );

const loadNormalizedRows = async (Model, reportMonth = 'All') => {
  const raw = await Model.find({}).select('-__v').lean();
  return filterByReportMonth(normalizeInventoryRows(raw), reportMonth);
};

module.exports = {
  INVENTORY_FIELD_ALIASES,
  normalizeInventoryRow,
  normalizeInventoryRows,
  filterByReportMonth,
  collectReportMonths,
  loadNormalizedRows,
};
