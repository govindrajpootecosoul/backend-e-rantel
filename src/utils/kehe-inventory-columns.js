const { formatUpc, parseNumber } = require('./kehe-columns');

const normalizeHeaderKey = (raw) =>
  String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[%()]/g, '')
    .replace(/[\s./-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

const HEADER_ALIASES = {
  enterprisesupplier: 'enterpriseSupplier',
  enterprise_supplier: 'enterpriseSupplier',
  totalquantityonhand: 'totalQuantityOnHand',
  total_quantity_on_hand: 'totalQuantityOnHand',
  totalquantityonpurchaseorder: 'totalQuantityOnPurchaseOrder',
  totalweeksonhand: 'totalWeeksOnHand',
  totalweeksonpo: 'totalWeeksOnPO',
  totalquantityonsalesorder: 'totalQuantityOnSalesOrder',
  brand: 'brand',
  brandtotalquantityonhand: 'brandTotalQuantityOnHand',
  brandtotalquantityonpurchaseorder: 'brandTotalQuantityOnPurchaseOrder',
  brandtotalweeksonhand: 'brandTotalWeeksOnHand',
  brandtotalweeksonpo: 'brandTotalWeeksOnPO',
  brandtotalquantityonsalesorder: 'brandTotalQuantityOnSalesOrder',
  dc: 'dc',
  dctotalquantityonhand: 'dcTotalQuantityOnHand',
  dctotalquantityonpurchaseorder: 'dcTotalQuantityOnPurchaseOrder',
  dctotalweeksonhand: 'dcTotalWeeksOnHand',
  dctotalweeksonpo: 'dcTotalWeeksOnPO',
  dctotalquantityonsalesorder: 'dcTotalQuantityOnSalesOrder',
  textbox31: 'textbox31',
  upc: 'upc',
  productdescription: 'productDescription',
  vendorcasepack: 'vendorCasePack',
  quantityonhand: 'quantityOnHand',
  quantityonpurchaseorder: 'quantityOnPurchaseOrder',
  weeksonhand: 'weeksOnHand',
  weeksonpo: 'weeksOnPO',
  quantityonsalesorder: 'quantityOnSalesOrder',
  downloaded_on: 'downloadedOn',
  sku: 'sku',
  box_per_case: 'boxPerCase',
  material: 'material',
  product_category: 'productCategory',
  product_sub_category: 'productSubCategory',
  product_type: 'productType',
  esn: 'esn',
  supplier: 'supplier',
  broker: 'broker',
  itemdescription: 'itemDescription',
  reason: 'reason',
  note: 'note',
  pack: 'pack',
  size: 'size',
  uom: 'uom',
  guaranteedshelflifedaystocustomer: 'guaranteedShelfLifeDaysToCustomer',
  sellbydate: 'sellByDate',
  daysremainingtoshiptocustomer: 'daysRemainingToShipToCustomer',
  unitsalesvelocityperday: 'unitSalesVelocityPerDay',
  unitsonhandwithnoforecastdemand: 'unitsOnHandWithNoForecastDemand',
};

const NUMERIC_FIELDS = new Set([
  'totalQuantityOnHand',
  'totalQuantityOnPurchaseOrder',
  'totalWeeksOnHand',
  'totalWeeksOnPO',
  'totalQuantityOnSalesOrder',
  'brandTotalQuantityOnHand',
  'brandTotalQuantityOnPurchaseOrder',
  'brandTotalWeeksOnHand',
  'brandTotalWeeksOnPO',
  'brandTotalQuantityOnSalesOrder',
  'dcTotalQuantityOnHand',
  'dcTotalQuantityOnPurchaseOrder',
  'dcTotalWeeksOnHand',
  'dcTotalWeeksOnPO',
  'dcTotalQuantityOnSalesOrder',
  'vendorCasePack',
  'quantityOnHand',
  'quantityOnPurchaseOrder',
  'weeksOnHand',
  'weeksOnPO',
  'quantityOnSalesOrder',
  'boxPerCase',
  'guaranteedShelfLifeDaysToCustomer',
  'daysRemainingToShipToCustomer',
  'unitSalesVelocityPerDay',
  'unitsOnHandWithNoForecastDemand',
]);

const mapHeaderToField = (header) => HEADER_ALIASES[normalizeHeaderKey(header)] || null;

const parseReportMonth = (downloadedOn) => {
  const s = String(downloadedOn ?? '').trim();
  if (!s) return '';
  const m = s.match(/(\d{1,2})[-/](\w{3,})[-/](\d{2,4})/i);
  if (m) {
    const mon = m[2].charAt(0).toUpperCase() + m[2].slice(1, 3).toLowerCase();
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${mon}-${yr}`;
  }
  return s;
};

/** Days used for aging buckets (shelf-life based, else weeks on hand). */
const computeInventoryAgeDays = (doc) => {
  const remaining = doc.daysRemainingToShipToCustomer;
  const guaranteed = doc.guaranteedShelfLifeDaysToCustomer;
  if (
    remaining !== null &&
    remaining !== undefined &&
    guaranteed !== null &&
    guaranteed !== undefined &&
    guaranteed > 0
  ) {
    const age = guaranteed - remaining;
    if (age >= 0) return age;
  }
  if (doc.weeksOnHand !== null && doc.weeksOnHand !== undefined && doc.weeksOnHand > 0) {
    return Math.round(doc.weeksOnHand * 7);
  }
  return 0;
};

const AGING_BUCKET_IDS = ['lte30', 'd31_60', 'd61_90', 'd91_120', 'd121_365', 'd366plus'];

const bucketIdForAgeDays = (ageDays) => {
  const age = Number(ageDays) || 0;
  if (age <= 30) return 'lte30';
  if (age <= 60) return 'd31_60';
  if (age <= 90) return 'd61_90';
  if (age <= 120) return 'd91_120';
  if (age <= 365) return 'd121_365';
  return 'd366plus';
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
      doc[field] = parseNumber(value);
    } else {
      doc[field] = value === null || value === undefined ? '' : String(value).trim();
    }
  }

  if (!doc.boxPerCase && doc.vendorCasePack) {
    doc.boxPerCase = doc.vendorCasePack;
  }

  doc.reportMonth = parseReportMonth(doc.downloadedOn);
  doc.inventoryAgeDays = computeInventoryAgeDays(doc);
  doc.agingBucket = bucketIdForAgeDays(doc.inventoryAgeDays);

  return doc;
};

const hasMinimumData = (doc) =>
  Boolean(
    (doc.sku && doc.dc) ||
      doc.quantityOnHand > 0 ||
      doc.upc ||
      doc.productDescription
  );

module.exports = {
  rowFromRecord,
  hasMinimumData,
  AGING_BUCKET_IDS,
  bucketIdForAgeDays,
  parseReportMonth,
  computeInventoryAgeDays,
  HEADER_ALIASES,
  NUMERIC_FIELDS,
  mapHeaderToField,
};
