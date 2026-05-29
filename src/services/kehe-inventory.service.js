const KeheInventory = require('../models/KeheInventory');
const KeheChainStore = require('../models/KeheChainStore');
const { AGING_BUCKET_IDS } = require('../utils/kehe-inventory-columns');

const BUCKET_META = [
  { id: 'lte30', label: '<= 30 days', group: 'below91' },
  { id: 'd31_60', label: '31 to 60 days', group: 'below91' },
  { id: 'd61_90', label: '61 to 90 days', group: 'below91' },
  { id: 'd91_120', label: '91 to 120 days', group: 'above90' },
  { id: 'd121_365', label: '121 to 365 days', group: 'above90' },
  { id: 'd366plus', label: '+366 days', group: 'above90' },
];

const emptyBucketTotals = () =>
  Object.fromEntries(AGING_BUCKET_IDS.map((id) => [id, { qty: 0, vendorCost: 0 }]));

const buildMatch = (reportMonth) => {
  if (!reportMonth || reportMonth === 'All') return {};
  return { reportMonth };
};

const getSkuUnitCosts = async () => {
  const rows = await KeheChainStore.aggregate([
    { $match: { sku: { $ne: '' }, orderedCaseCostVendorCost: { $gt: 0 } } },
    {
      $group: {
        _id: '$sku',
        caseCost: { $avg: '$orderedCaseCostVendorCost' },
        casePack: { $avg: { $ifNull: ['$boxPerCase', 1] } },
      },
    },
  ]);
  const map = new Map();
  rows.forEach((r) => {
    const pack = r.casePack > 0 ? r.casePack : 1;
    map.set(r._id, { caseCost: r.caseCost, casePack: pack });
  });
  return map;
};

const lineVendorCost = (row, costMap) => {
  if (row.vendorCost !== null && row.vendorCost !== undefined) return row.vendorCost;
  const qty = row.quantityOnHand ?? 0;
  if (!qty) return 0;
  const ref = costMap.get(row.sku);
  if (!ref) return 0;
  const pack = row.vendorCasePack || row.boxPerCase || ref.casePack || 1;
  return (qty / pack) * ref.caseCost;
};

exports.getFilterOptions = async () => {
  const months = await KeheInventory.distinct('reportMonth');
  const sorted = months.filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)));
  return ['All', ...sorted];
};

exports.getDashboard = async (reportMonth = 'All') => {
  const match = buildMatch(reportMonth);
  const rows = await KeheInventory.find(match).select('-__v').lean();
  const costMap = await getSkuUnitCosts();

  const overview = emptyBucketTotals();
  const byDc = new Map();
  const bySkuDc = new Map();

  for (const row of rows) {
    const bucket = row.agingBucket || 'lte30';
    const qty = row.quantityOnHand ?? 0;
    const cost = lineVendorCost(row, costMap);

    if (!overview[bucket]) overview[bucket] = { qty: 0, vendorCost: 0 };
    overview[bucket].qty += qty;
    overview[bucket].vendorCost += cost;

    const dcKey = row.dc || 'Unknown';
    if (!byDc.has(dcKey)) {
      byDc.set(dcKey, { dc: dcKey, buckets: emptyBucketTotals() });
    }
    const dcRow = byDc.get(dcKey);
    dcRow.buckets[bucket].qty += qty;
    dcRow.buckets[bucket].vendorCost += cost;

    const skuKey = row.sku || 'Unknown';
    const gridKey = `${skuKey}::${dcKey}`;
    if (!bySkuDc.has(gridKey)) {
      bySkuDc.set(gridKey, {
        sku: skuKey,
        dc: dcKey,
        productDescription: row.productDescription || '',
        buckets: emptyBucketTotals(),
      });
    }
    const gridRow = bySkuDc.get(gridKey);
    gridRow.buckets[bucket].qty += qty;
    gridRow.buckets[bucket].vendorCost += cost;
  }

  const below91 = { qty: 0, vendorCost: 0 };
  const above90 = { qty: 0, vendorCost: 0 };

  BUCKET_META.forEach(({ id, group }) => {
    const b = overview[id] || { qty: 0, vendorCost: 0 };
    if (group === 'below91') {
      below91.qty += b.qty;
      below91.vendorCost += b.vendorCost;
    } else {
      above90.qty += b.qty;
      above90.vendorCost += b.vendorCost;
    }
  });

  const dcRows = [...byDc.values()]
    .map((d) => {
      const totals = emptyBucketTotals();
      AGING_BUCKET_IDS.forEach((id) => {
        totals[id] = d.buckets[id];
      });
      const totalQty = AGING_BUCKET_IDS.reduce((s, id) => s + d.buckets[id].qty, 0);
      const totalCost = AGING_BUCKET_IDS.reduce((s, id) => s + d.buckets[id].vendorCost, 0);
      return { dc: d.dc, buckets: totals, totalQty, totalCost };
    })
    .sort((a, b) => b.totalQty - a.totalQty);

  const skuGrid = [...bySkuDc.values()].sort((a, b) => {
    const aq = AGING_BUCKET_IDS.reduce((s, id) => s + a.buckets[id].qty, 0);
    const bq = AGING_BUCKET_IDS.reduce((s, id) => s + b.buckets[id].qty, 0);
    return bq - aq;
  });

  const dcList = [...new Set(rows.map((r) => r.dc).filter(Boolean))].sort();

  return {
    rowCount: rows.length,
    buckets: BUCKET_META,
    below91,
    above90,
    overview,
    byDc: dcRows,
    skuGrid,
    dcList,
  };
};

exports.enrichVendorCosts = async (docs, costMap) =>
  docs.map((doc) => ({
    ...doc,
    vendorCost: lineVendorCost(doc, costMap),
  }));

exports.getSkuUnitCosts = getSkuUnitCosts;
