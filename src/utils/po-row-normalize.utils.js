const { parseDate, parseNumber } = require('./sps-columns');

/** Canonical camelCase field → possible MongoDB keys (camel + snake). */
const PO_FIELD_ALIASES = {
  storeId: ['storeId', 'store_id'],
  distributor: ['distributor', 'distributors'],
  retailer: ['retailer', 'retailers'],
  channel: ['channel'],
  poNumber: ['poNumber', 'po_number'],
  poDate: ['poDate', 'po_date'],
  poRequestedDeliveryDate: ['poRequestedDeliveryDate', 'po_requested_delivery_date'],
  poAmount: ['poAmount', 'po_amount'],
  poStatus: ['poStatus', 'po_status'],
  actualFulfillmentDate: ['actualFulfillmentDate', 'actual_fulfillment_date'],
  invoiceNumber: ['invoiceNumber', 'invoice_number'],
  invoiceDate: ['invoiceDate', 'invoice_date'],
  invoiceAmount: ['invoiceAmount', 'invoice_amount'],
  shippingCity: ['shippingCity', 'shipping_city'],
  shippingState: ['shippingState', 'shipping_state'],
  shippingStateCode: ['shippingStateCode', 'shipping_state_code'],
  shippingCountry: ['shippingCountry', 'shipping_country'],
  shippingCountryCode: ['shippingCountryCode', 'shipping_country_code'],
  shippingPostalCode: ['shippingPostalCode', 'shipping_postal_code'],
  poLink: ['poLink', 'po_link'],
  manualInvoiceLink: ['manualInvoiceLink', 'manual_invoice_link'],
  spsInvoices: ['spsInvoices', 'sps_invoices'],
  manualInvoiceLink1: ['manualInvoiceLink1', 'manual_invoice_link1'],
  yearMonthPo: ['yearMonthPo', 'year_month_po'],
  delayDays: ['delayDays', 'delay_days'],
  poDeliveryStatus: ['poDeliveryStatus', 'po_delivery_status'],
  upcGtin: ['upcGtin', 'upc_gtin'],
  sku: ['sku'],
  skuQty: ['skuQty', 'sku_qty'],
  poCasePrice: ['poCasePrice', 'po_case_price'],
  poSales: ['poSales', 'po_sales'],
  invoiceQty: ['invoiceQty', 'invoice_qty'],
  invoiceCasePrice: ['invoiceCasePrice', 'invoice_case_price'],
  status: ['status'],
  totalSales: ['totalSales', 'total_sales'],
  boxPerCase: ['boxPerCase', 'box_per_case'],
  location: ['location'],
  warehouse: ['warehouse'],
  qtyDiff: ['qtyDiff', 'qty_diff'],
  amtDiff: ['amtDiff', 'amt_diff'],
  unitListCost: ['unitListCost', 'unit_list_cost'],
  commonPoDate: ['commonPoDate', 'common_po_date'],
  commonInvoiceDate: ['commonInvoiceDate', 'common_invoice_date'],
  newPoDeliveryStatus: ['newPoDeliveryStatus', 'new_po_delivery_status'],
  newStatus: ['newStatus', 'new_status'],
  srp: ['srp'],
  updatedAt: ['updatedAt', 'updated_at'],
};

const NUMERIC_FIELDS = new Set([
  'poAmount',
  'invoiceAmount',
  'delayDays',
  'skuQty',
  'poSales',
  'invoiceQty',
  'totalSales',
  'qtyDiff',
  'amtDiff',
  'unitListCost',
  'poCasePrice',
  'invoiceCasePrice',
  'boxPerCase',
  'srp',
]);

const DATE_FIELDS = new Set([
  'poDate',
  'poRequestedDeliveryDate',
  'actualFulfillmentDate',
  'invoiceDate',
  'commonPoDate',
  'commonInvoiceDate',
  'updatedAt',
]);

const MONTH_ABBR = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const pickRawField = (doc, canonicalKey) => {
  const aliases = PO_FIELD_ALIASES[canonicalKey];
  if (!aliases) return doc[canonicalKey];
  for (const alias of aliases) {
    const value = doc[alias];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const parsePeriodLabel = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  const match = s.match(/^([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const month = MONTH_ABBR[match[1].toLowerCase()];
    if (month !== undefined) return new Date(Date.UTC(Number(match[2]), month, 1));
  }
  return parseDate(value);
};

const normalizeFieldValue = (canonicalKey, raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return NUMERIC_FIELDS.has(canonicalKey) ? 0 : undefined;
  }
  if (NUMERIC_FIELDS.has(canonicalKey)) return parseNumber(raw) ?? 0;
  if (DATE_FIELDS.has(canonicalKey)) {
    if (canonicalKey === 'commonPoDate' || canonicalKey === 'commonInvoiceDate') {
      return parsePeriodLabel(raw) || parseDate(raw);
    }
    return parseDate(raw);
  }
  return String(raw).trim();
};

const normalizePoRow = (doc, defaultStoreId) => {
  if (!doc || typeof doc !== 'object') return doc;

  const row = { _id: doc._id };

  for (const canonicalKey of Object.keys(PO_FIELD_ALIASES)) {
    const raw = pickRawField(doc, canonicalKey);
    const normalized = normalizeFieldValue(canonicalKey, raw);
    if (normalized !== undefined) row[canonicalKey] = normalized;
  }

  if (defaultStoreId && !row.storeId) row.storeId = defaultStoreId;

  if (row.poStatus && !row.status) row.status = row.poStatus;
  if (row.status && !row.poStatus) row.poStatus = row.status;

  if (row.poDate && !row.commonPoDate) row.commonPoDate = row.poDate;
  if (row.invoiceDate && !row.commonInvoiceDate) row.commonInvoiceDate = row.invoiceDate;

  for (const field of NUMERIC_FIELDS) {
    if (row[field] == null) row[field] = 0;
  }

  return row;
};

const normalizePoRows = (docs, defaultStoreId) =>
  (docs || []).map((doc) => normalizePoRow(doc, defaultStoreId));

const buildCoalesceExpr = (aliases) => {
  if (!aliases?.length) return null;
  if (aliases.length === 1) return `$${aliases[0]}`;
  return aliases.slice(1).reduce((acc, alias) => ({ $ifNull: [`$${alias}`, acc] }), null);
};

const mongoToDateExpr = (fieldExpr) => ({
  $let: {
    vars: { raw: fieldExpr },
    in: {
      $cond: {
        if: { $in: [{ $type: '$$raw' }, ['date', 'timestamp']] },
        then: '$$raw',
        else: {
          $convert: {
            input: '$$raw',
            to: 'date',
            onError: null,
            onNull: null,
          },
        },
      },
    },
  },
});

/** MongoDB $addFields: coalesce snake_case and camelCase into canonical camelCase keys. */
const normalizeFieldsStage = {
  $addFields: Object.fromEntries(
    Object.entries(PO_FIELD_ALIASES).map(([canonicalKey, aliases]) => [
      canonicalKey,
      buildCoalesceExpr(aliases),
    ])
  ),
};

/** Build a MongoDB match clause that works for both snake_case and camelCase field names. */
const buildDbFieldMatch = (canonicalKey, value) => {
  const aliases = PO_FIELD_ALIASES[canonicalKey] || [canonicalKey];
  if (aliases.length === 1) return { [aliases[0]]: value };
  return { $or: aliases.map((alias) => ({ [alias]: value })) };
};

const mergeDistinctAliases = async (Model, canonicalKey) => {
  const aliases = PO_FIELD_ALIASES[canonicalKey] || [canonicalKey];
  const lists = await Promise.all(aliases.map((field) => Model.distinct(field).lean()));
  return [...new Set(lists.flat().filter((v) => v !== undefined && v !== null && v !== ''))];
};

module.exports = {
  PO_FIELD_ALIASES,
  pickRawField,
  normalizePoRow,
  normalizePoRows,
  normalizeFieldsStage,
  mongoToDateExpr,
  buildDbFieldMatch,
  mergeDistinctAliases,
  parsePeriodLabel,
};
