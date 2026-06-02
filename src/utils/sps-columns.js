const normalizeHeaderKey = (raw) =>
  String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[%()#]/g, '')
    .replace(/[\s./-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

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
  'srp',
]);

const DATE_FIELDS = new Set([
  'poDate',
  'poRequestedDeliveryDate',
  'invoiceDate',
  'commonPoDate',
  'commonInvoiceDate',
]);

/** Maps normalized spreadsheet headers → purchase order schema field */
const HEADER_ALIASES = {
  store_id: 'storeId',
  storeid: 'storeId',
  distributor: 'distributor',
  distributors: 'distributor',
  retailer: 'retailer',
  retailers: 'retailer',
  channel: 'channel',
  po_number: 'poNumber',
  po: 'poNumber',
  po_date: 'poDate',
  po_requested_delivery_date: 'poRequestedDeliveryDate',
  due_date: 'poRequestedDeliveryDate',
  po_amount: 'poAmount',
  po_status: 'poStatus',
  invoice_number: 'invoiceNumber',
  invoice: 'invoiceNumber',
  invoice_date: 'invoiceDate',
  invoice_amount: 'invoiceAmount',
  shipping_city: 'shippingCity',
  city: 'shippingCity',
  year_month_po: 'yearMonthPo',
  yearmonthpo: 'yearMonthPo',
  delay_days: 'delayDays',
  po_delivery_status: 'poDeliveryStatus',
  upc_gtin: 'upcGtin',
  upc: 'upcGtin',
  gtin: 'upcGtin',
  sku: 'sku',
  sku_qty: 'skuQty',
  sku_quantity: 'skuQty',
  po_sku_qty: 'skuQty',
  po_sku_quantity: 'skuQty',
  po_sales: 'poSales',
  invoice_qty: 'invoiceQty',
  invoice_quantity: 'invoiceQty',
  inv_qty: 'invoiceQty',
  status: 'status',
  total_sales: 'totalSales',
  location: 'location',
  warehouse: 'warehouse',
  qty_diff: 'qtyDiff',
  amt_diff: 'amtDiff',
  unit_list_cost: 'unitListCost',
  unit_lc: 'unitListCost',
  common_po_date: 'commonPoDate',
  common_invoice_date: 'commonInvoiceDate',
  new_po_delivery_status: 'newPoDeliveryStatus',
  new_status: 'newStatus',
  srp: 'srp',
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const parseDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatUpc = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    try {
      return BigInt(rounded).toString();
    } catch {
      return String(rounded);
    }
  }
  return String(value).trim();
};

const mapHeaderToField = (header) => {
  const key = normalizeHeaderKey(header);
  if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
  if (/^[a-z][a-z0-9_]*$/.test(key)) {
    const camel = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    return camel;
  }
  return null;
};

const rowFromRecord = (record) => {
  const doc = {};
  for (const [header, value] of Object.entries(record)) {
    const field = mapHeaderToField(header);
    if (!field) continue;

    if (field === 'upcGtin') {
      doc[field] = formatUpc(value);
      continue;
    }

    if (DATE_FIELDS.has(field)) {
      doc[field] = parseDate(value);
      continue;
    }

    if (NUMERIC_FIELDS.has(field)) {
      doc[field] = parseNumber(value);
    } else {
      doc[field] = value === null || value === undefined ? '' : String(value).trim();
    }
  }
  return doc;
};

/** Blank Excel cells → 0 in DB so KPI SUM matches Excel SUM on each column. */
const excelNumericDefaultZero = (row) => {
  for (const field of NUMERIC_FIELDS) {
    if (row[field] == null) row[field] = 0;
  }
};

const enrichRow = (doc, storeId) => {
  const row = { ...doc, storeId: doc.storeId || storeId, updatedAt: new Date() };

  if (row.poStatus && !row.status) row.status = row.poStatus;
  if (row.status && !row.poStatus) row.poStatus = row.status;
  if (row.poDate && !row.commonPoDate) row.commonPoDate = row.poDate;
  if (row.invoiceDate && !row.commonInvoiceDate) row.commonInvoiceDate = row.invoiceDate;

  excelNumericDefaultZero(row);

  return row;
};

/** Legacy: at least one identifier (used where single field is valid). */
const hasMinimumData = (doc) => Boolean(doc.poNumber || doc.sku);

/** Retail PO/SO rows must have both PO # and SKU (matches Excel data rows, drops ghost lines). */
const isImportablePoSkuRow = (doc) => {
  const po = String(doc.poNumber ?? '').trim();
  const sku = String(doc.sku ?? '').trim();
  return po.length > 0 && sku.length > 0;
};

const isBlankSpreadsheetRecord = (record) =>
  Object.values(record).every((value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    return false;
  });

module.exports = {
  normalizeHeaderKey,
  mapHeaderToField,
  rowFromRecord,
  enrichRow,
  hasMinimumData,
  isImportablePoSkuRow,
  isBlankSpreadsheetRecord,
  parseNumber,
  parseDate,
};
