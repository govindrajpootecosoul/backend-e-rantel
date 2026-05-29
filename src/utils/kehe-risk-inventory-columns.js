const { formatUpc, parseNumber } = require('./kehe-columns');
const { parseReportMonth } = require('./kehe-inventory-columns');

const HEADER_ALIASES = {
  esn: 'esn',
  supplier: 'supplier',
  dc: 'dc',
  broker: 'broker',
  upc: 'upc',
  brand: 'brand',
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
  downloaded_on: 'downloadedOn',
  sku: 'sku',
  box_per_case: 'boxPerCase',
  material: 'material',
  product_category: 'productCategory',
  product_sub_category: 'productSubCategory',
  product_type: 'productType',
};

const NUMERIC_FIELDS = new Set([
  'pack',
  'size',
  'guaranteedShelfLifeDaysToCustomer',
  'daysRemainingToShipToCustomer',
  'unitSalesVelocityPerDay',
  'unitsOnHandWithNoForecastDemand',
  'boxPerCase',
]);

const normalizeHeaderKey = (raw) =>
  String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[%()]/g, '')
    .replace(/[\s./-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

const mapHeaderToField = (header) => HEADER_ALIASES[normalizeHeaderKey(header)] || null;

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

  doc.reportMonth = parseReportMonth(doc.downloadedOn);
  return doc;
};

const hasMinimumData = (doc) =>
  Boolean(
    doc.sku ||
      doc.dc ||
      doc.upc ||
      doc.itemDescription ||
      (doc.unitsOnHandWithNoForecastDemand && doc.unitsOnHandWithNoForecastDemand > 0)
  );

module.exports = {
  rowFromRecord,
  hasMinimumData,
};
