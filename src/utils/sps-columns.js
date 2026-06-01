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
  po_sku_qty: 'skuQty',
  po_sales: 'poSales',
  invoice_qty: 'invoiceQty',
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

const enrichRow = (doc, storeId) => {
  const row = { ...doc, storeId: doc.storeId || storeId, updatedAt: new Date() };

  if (row.poStatus && !row.status) row.status = row.poStatus;
  if (row.status && !row.poStatus) row.poStatus = row.status;
  if (row.poAmount != null && row.poSales == null) row.poSales = row.poAmount;
  if (row.invoiceAmount != null && row.totalSales == null) row.totalSales = row.invoiceAmount;
  if (row.poDate && !row.commonPoDate) row.commonPoDate = row.poDate;
  if (row.invoiceDate && !row.commonInvoiceDate) row.commonInvoiceDate = row.invoiceDate;

  const skuQty = row.skuQty ?? 0;
  const invoiceQty = row.invoiceQty ?? 0;
  const poSales = row.poSales ?? row.poAmount ?? 0;
  const totalSales = row.totalSales ?? row.invoiceAmount ?? 0;

  if (row.qtyDiff == null) row.qtyDiff = skuQty - invoiceQty;
  if (row.amtDiff == null) row.amtDiff = poSales - totalSales;

  return row;
};

const hasMinimumData = (doc) => Boolean(doc.poNumber || doc.sku);

module.exports = {
  normalizeHeaderKey,
  mapHeaderToField,
  rowFromRecord,
  enrichRow,
  hasMinimumData,
  parseNumber,
  parseDate,
};
