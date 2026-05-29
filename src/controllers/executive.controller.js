const PurchaseOrder = require('../models/PurchaseOrder');
const executiveCache = require('../services/executiveCache');
const { matchesDateFilter, resolvePoMonthKey } = require('../utils/dateFilters');

const FILTER_FIELDS = [
  'retailer',
  'location',
  'status',
  'poStatus',
  'warehouse',
  'yearMonthPo',
  'distributor',
  'storeId',
  'poDeliveryStatus',
  'sku',
  'delayDays',
];

const PROJECTION =
  'storeId poNumber sku poSales poDate totalSales invoiceQty skuQty poAmount invoiceAmount poStatus poDeliveryStatus distributor retailer location status warehouse delayDays updatedAt commonInvoiceDate commonPoDate yearMonthPo';

const CHART_PERIODS = ['daily', 'monthly', 'yearly'];

const prependAll = (arr) => ['All', ...arr.filter(Boolean).sort()];

const buildMatch = (filters = {}) => {
  const match = {};
  for (const field of FILTER_FIELDS) {
    if (field === 'yearMonthPo') continue;
    const value = filters[field];
    if (value === undefined || value === null || value === '' || value === 'All') {
      continue;
    }
    if (field === 'delayDays') {
      const num = Number(value);
      if (!Number.isNaN(num)) match.delayDays = num;
      continue;
    }
    match[field] = value;
  }
  return match;
};

const dedupeRows = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.storeId || ''}|${row.poNumber || ''}|${row.sku || ''}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const rowTime = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    if (rowTime >= existingTime) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
};

const uniqueCount = (rows, field) => {
  const set = new Set();
  for (const row of rows) {
    const val = row[field];
    if (val !== undefined && val !== null && val !== '') set.add(String(val));
  }
  return set.size;
};

const uniquePoCount = (rows) => {
  const set = new Set();
  for (const row of rows) {
    set.add(`${row.storeId || ''}|${row.poNumber || ''}`);
  }
  return set.size;
};

const sumField = (rows, field) =>
  rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);

const getRowDate = (row, dateField) => {
  if (dateField === 'poDate') {
    const raw = row.commonPoDate || row.poDate;
    if (raw) {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) return date;
    }
    if (row.yearMonthPo) {
      const date = new Date(row.yearMonthPo);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
  }
  const raw = row[dateField];
  if (raw) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (dateField === 'commonInvoiceDate' && row.commonPoDate) {
    const date = new Date(row.commonPoDate);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
};

const formatPeriodKey = (date, period) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (period === 'daily') return `${y}-${m}-${d}`;
  if (period === 'yearly') return String(y);
  return `${y}-${m}`;
};

const groupByPeriodRetailer = (rows, amountField, dateField) => {
  const result = { daily: [], monthly: [], yearly: [] };
  const maps = {
    daily: new Map(),
    monthly: new Map(),
    yearly: new Map(),
  };

  for (const row of rows) {
    const retailer = row.retailer || 'Unknown';
    const amount = Number(row[amountField]) || 0;

    for (const period of CHART_PERIODS) {
      let periodLabel;
      if (period === 'monthly' && dateField === 'poDate') {
        periodLabel = resolvePoMonthKey(row);
        if (!periodLabel) continue;
      } else {
        const date = getRowDate(row, dateField);
        if (!date) continue;
        periodLabel = formatPeriodKey(date, period);
      }
      const key = `${periodLabel}||${retailer}`;
      const map = maps[period];
      if (!map.has(key)) {
        map.set(key, { period: periodLabel, retailer, amount: 0 });
      }
      map.get(key).amount += amount;
    }
  }

  for (const period of CHART_PERIODS) {
    result[period] = Array.from(maps[period].values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    );
  }

  return result;
};

const groupByDeliveryStatus = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const status = row.poDeliveryStatus || 'Unknown';
    map.set(status, (map.get(status) || 0) + 1);
  }
  return Array.from(map.entries()).map(([status, count]) => ({ status, count }));
};

const computeMetrics = (deduped) => {
  const skuPoQty = sumField(deduped, 'skuQty');
  const skuInvoiceQty = sumField(deduped, 'invoiceQty');
  const poAmount = sumField(deduped, 'poSales');
  const invoiceAmount = sumField(deduped, 'totalSales') || sumField(deduped, 'invoiceAmount');

  return {
    summary: {
      channelSelect: uniqueCount(deduped, 'storeId'),
      uniqueDistributors: uniqueCount(deduped, 'distributor'),
      uniqueRetailers: uniqueCount(deduped, 'retailer'),
      uniqueLocations: uniqueCount(deduped, 'location'),
    },
    kpiCards: {
      totalPoCount: uniquePoCount(deduped),
      skuPoQty,
      poAmount,
      diffQty: skuPoQty - skuInvoiceQty,
      skuInvoiceQty,
      invoiceAmount,
      diffAmount: poAmount - invoiceAmount,
    },
  };
};

exports.getFilters = async (req, res) => {
  try {
    const distinctPromises = FILTER_FIELDS.map((field) => {
      if (field === 'delayDays') {
        return PurchaseOrder.distinct('delayDays').lean();
      }
      return PurchaseOrder.distinct(field).lean();
    });

    const results = await Promise.all(distinctPromises);

    const filters = {};
    FILTER_FIELDS.forEach((field, index) => {
      if (field === 'yearMonthPo') {
        filters[field] = ['All'];
        return;
      }
      let values = results[index] || [];
      if (field === 'delayDays') {
        values = values.map((v) => String(v));
      } else {
        values = values.map((v) => String(v));
      }
      filters[field] = prependAll(values);
    });

    return res.json({ success: true, data: filters });
  } catch (err) {
    console.error('getFilters error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load filters' });
  }
};

exports.getDataset = async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';

    if (!forceRefresh) {
      const cached = executiveCache.get();
      if (cached) {
        res.set('X-Cache', 'HIT');
        return res.json(cached);
      }
    }

    const rows = await PurchaseOrder.find({}).select(PROJECTION).lean();

    const responseBody = {
      success: true,
      data: {
        rowCount: rows.length,
        rows,
        lastUpdated: new Date().toISOString(),
      },
    };

    executiveCache.set(responseBody);
    res.set('X-Cache', 'MISS');
    return res.json(responseBody);
  } catch (err) {
    console.error('getDataset error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load executive dataset' });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const filters = req.body?.filters || req.body || {};
    const yearMonthFilter = filters.yearMonthPo;
    const match = buildMatch(filters);

    let rows = await PurchaseOrder.find(match).select(PROJECTION).lean();

    if (yearMonthFilter && yearMonthFilter !== 'All') {
      rows = rows.filter((row) => matchesDateFilter(resolvePoMonthKey(row), yearMonthFilter));
    }

    const deduped = dedupeRows(rows);
    const { summary, kpiCards } = computeMetrics(deduped);

    const charts = {
      poSaleByRetailer: groupByPeriodRetailer(rows, 'poSales', 'poDate'),
      invoiceSaleByRetailer: groupByPeriodRetailer(rows, 'totalSales', 'commonInvoiceDate'),
      poDeliveryStatus: groupByDeliveryStatus(rows),
      poStatusBreakdown: groupByDeliveryStatus(
        rows.map((r) => ({ ...r, poDeliveryStatus: r.poStatus }))
      ),
    };

    return res.json({
      success: true,
      data: {
        rowCount: rows.length,
        dedupedCount: deduped.length,
        summary,
        kpiCards,
        charts,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('getDashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard data' });
  }
};
