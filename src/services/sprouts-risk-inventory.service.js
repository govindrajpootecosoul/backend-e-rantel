const SproutsRiskInventory = require('../models/SproutsRiskInventory');
const SproutsInventory = require('../models/SproutsInventory');
const { buildRiskMatch } = require('../utils/kehe-risk-filters.utils');
const { normalizeInventoryRows } = require('../utils/inventory-normalize.utils');

const sortValues = (arr = []) =>
  [...new Set(arr.filter((v) => v && String(v).trim()))].sort((a, b) =>
    String(a).localeCompare(String(b))
  );

const emptyAtRiskTotals = () => ({
  unitsOnHandWithNoForecastDemand: 0,
  unitSalesVelocityPerDay: 0,
  daysRemainingToShipToCustomer: 0,
  guaranteedShelfLifeDaysToCustomer: 0,
});

const emptyStockTotals = () => ({
  qtyOnHand: 0,
  qtyOnPo: 0,
  qtyOnSo: 0,
  weeksOnHand: 0,
  weeksOnPo: 0,
});

/** Match inventory rows to the same SKU + DC as risk lines (not all inventory). */
const buildInventoryOrFromRiskRows = (riskRows) => {
  const seen = new Set();
  const or = [];
  for (const row of riskRows) {
    if (!row.sku) continue;
    const dc = row.dc || '';
    const key = `${row.sku}::${dc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    or.push({ sku: row.sku, dc });
  }
  return or;
};

const applyNonMonthFilters = (base, filters) => {
  const q = { ...base };
  for (const key of ['sku', 'dc', 'material', 'upc']) {
    if (filters[key] && filters[key] !== 'All') q[key] = filters[key];
  }
  return q;
};

exports.getFilterOptions = async (filters = {}) => {
  const baseMatch = buildRiskMatch(filters);
  const pipeline = [
    Object.keys(baseMatch).length ? { $match: baseMatch } : null,
    {
      $group: {
        _id: null,
        reportMonth: { $addToSet: '$reportMonth' },
        sku: { $addToSet: '$sku' },
        dc: { $addToSet: '$dc' },
        material: { $addToSet: '$material' },
        upc: { $addToSet: '$upc' },
      },
    },
  ].filter(Boolean);

  const [result] = await SproutsRiskInventory.aggregate(pipeline);

  return {
    reportMonth: sortValues(result?.reportMonth),
    sku: sortValues(result?.sku),
    dc: sortValues(result?.dc),
    material: sortValues(result?.material),
    upc: sortValues(result?.upc),
  };
};

exports.getDashboard = async (filters = {}) => {
  const match = buildRiskMatch(filters);
  const riskRows = await SproutsRiskInventory.find(match).select('-__v').lean();

  const materialQtyMap = new Map();
  for (const row of riskRows) {
    const material = row.material || 'Unknown';
    const qty = row.unitsOnHandWithNoForecastDemand ?? 0;
    materialQtyMap.set(material, (materialQtyMap.get(material) || 0) + qty);
  }

  const materialByQtyOnHand = [...materialQtyMap.entries()]
    .map(([material, value]) => ({ material, value }))
    .sort((a, b) => b.value - a.value);

  const atRisk = riskRows.map((row) => ({
    reportDate: row.downloadedOn || row.reportMonth || '—',
    dc: row.dc || '—',
    broker: row.broker || '—',
    sku: row.sku || '—',
    sellByDate: row.sellByDate || '—',
    unitsOnHandWithNoForecastDemand: row.unitsOnHandWithNoForecastDemand ?? 0,
    unitSalesVelocityPerDay: row.unitSalesVelocityPerDay ?? 0,
    daysRemainingToShipToCustomer: row.daysRemainingToShipToCustomer ?? 0,
    guaranteedShelfLifeDaysToCustomer: row.guaranteedShelfLifeDaysToCustomer ?? 0,
    uom: row.uom || '—',
  }));

  const atRiskTotals = atRisk.reduce(
    (acc, row) => ({
      unitsOnHandWithNoForecastDemand:
        acc.unitsOnHandWithNoForecastDemand + row.unitsOnHandWithNoForecastDemand,
      unitSalesVelocityPerDay: acc.unitSalesVelocityPerDay + row.unitSalesVelocityPerDay,
      daysRemainingToShipToCustomer:
        acc.daysRemainingToShipToCustomer + row.daysRemainingToShipToCustomer,
      guaranteedShelfLifeDaysToCustomer:
        acc.guaranteedShelfLifeDaysToCustomer + row.guaranteedShelfLifeDaysToCustomer,
    }),
    emptyAtRiskTotals()
  );

  // No risk upload → no stock status or PO/SO charts from inventory
  if (riskRows.length === 0) {
    return {
      rowCount: 0,
      materialByQtyOnHand,
      materialByPoSo: [],
      atRisk,
      atRiskTotals,
      stockStatus: [],
      stockTotals: emptyStockTotals(),
      hasRiskData: false,
      hasInventoryEnrichment: false,
    };
  }

  const skuDcOr = buildInventoryOrFromRiskRows(riskRows);
  const invBaseQuery = applyNonMonthFilters({ $or: skuDcOr }, filters);

  const inventoryRows = normalizeInventoryRows(await SproutsInventory.find(invBaseQuery).lean());

  const materialPoMap = new Map();
  const materialSoMap = new Map();
  for (const row of inventoryRows) {
    const material = row.material || 'Unknown';
    materialPoMap.set(
      material,
      (materialPoMap.get(material) || 0) + (row.quantityOnPurchaseOrder ?? 0)
    );
    materialSoMap.set(
      material,
      (materialSoMap.get(material) || 0) + (row.quantityOnSalesOrder ?? 0)
    );
  }

  const materials = new Set([
    ...materialByQtyOnHand.map((m) => m.material),
    ...materialPoMap.keys(),
    ...materialSoMap.keys(),
  ]);

  const materialByPoSo = [...materials].map((material) => ({
    material,
    qtyOnPo: materialPoMap.get(material) || 0,
    qtyOnSo: materialSoMap.get(material) || 0,
  }));

  const stockStatus = inventoryRows
    .map((row) => ({
      inventoryDate: row.downloadedOn || '—',
      dc: row.dc || '—',
      sku: row.sku || '—',
      qtyOnHand: row.quantityOnHand ?? 0,
      qtyOnPo: row.quantityOnPurchaseOrder ?? 0,
      qtyOnSo: row.quantityOnSalesOrder ?? 0,
      vendorCasePack: row.vendorCasePack ?? row.boxPerCase ?? 0,
      weeksOnHand: row.weeksOnHand ?? 0,
      weeksOnPo: row.weeksOnPO ?? 0,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.dc.localeCompare(b.dc));

  const stockTotals = stockStatus.reduce(
    (acc, row) => ({
      qtyOnHand: acc.qtyOnHand + row.qtyOnHand,
      qtyOnPo: acc.qtyOnPo + row.qtyOnPo,
      qtyOnSo: acc.qtyOnSo + row.qtyOnSo,
      weeksOnHand: acc.weeksOnHand + row.weeksOnHand,
      weeksOnPo: acc.weeksOnPo + row.weeksOnPo,
    }),
    emptyStockTotals()
  );

  return {
    rowCount: riskRows.length,
    materialByQtyOnHand,
    materialByPoSo,
    atRisk,
    atRiskTotals,
    stockStatus,
    stockTotals,
    hasRiskData: true,
    hasInventoryEnrichment: inventoryRows.length > 0,
  };
};
