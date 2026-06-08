const { getPurchaseOrderModelByCollection } = require('../models/PurchaseOrder');
const { formatCategoryLabel, categoryKeysMatch } = require('../utils/category.utils');
const executiveCache = require('./executiveCache');
const { matchesDateFilter, resolvePoMonthKey } = require('../utils/dateFilters');
const { buildDetailLists } = require('../utils/kpi-detail-lists');
const { buildDbFieldMatch, normalizePoRow } = require('../utils/po-row-normalize.utils');
const { sumField } = require('../utils/sum-numeric.utils');
const { sumInvoiceQty } = require('../utils/effective-qty.utils');

const EXECUTIVE_COLLECTIONS = ['purchase_orders_sps', 'purchase_orders_waitrose'];

const CATEGORY_LABEL_BY_COLLECTION = {
  purchase_orders_sps: 'SPS',
  purchase_orders_waitrose: 'Waitrose',
};

const FILTER_FIELDS = [
  'category',
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

const CHART_PERIODS = ['daily', 'monthly', 'yearly'];

const STORE_ID_BY_COLLECTION = {
  purchase_orders_sps: 'sps',
  purchase_orders_waitrose: 'waitrose',
};
const FILTERED_ROWS_TTL_MS = 60 * 1000;

const filteredRowsCache = new Map();
const pendingRowLoads = new Map();

const tagRowsWithCategory = (rows, collection) =>
  rows.map((row) => ({
    ...row,
    category: CATEGORY_LABEL_BY_COLLECTION[collection] || collection,
  }));

const buildMatch = (filters = {}) => {
  const conditions = [];

  for (const field of FILTER_FIELDS) {
    if (field === 'yearMonthPo' || field === 'category' || field === 'storeId') continue;
    const value = filters[field];
    if (value === undefined || value === null || value === '' || value === 'All') {
      continue;
    }
    if (field === 'delayDays') {
      const num = Number(value);
      if (!Number.isNaN(num)) conditions.push(buildDbFieldMatch('delayDays', num));
      continue;
    }
    conditions.push(buildDbFieldMatch(field, value));
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
};

const filterCacheKey = (filters = {}) => JSON.stringify(filters);

const normalizeCategoryFilter = (value) => {
  if (!value || value === 'All') return null;
  return formatCategoryLabel(value);
};

const applyCategoryFilter = (rows, filters = {}) => {
  const want = normalizeCategoryFilter(filters.category);
  if (!want) return rows;
  return rows.filter((row) => categoryKeysMatch(row.category || '', want));
};

const applyStoreIdFilter = (rows, filters = {}) => {
  const want = filters.storeId;
  if (!want || want === 'All') return rows;
  const normalized = String(want).toLowerCase();
  return rows.filter((row) => String(row.storeId || '').toLowerCase() === normalized);
};

const dedupeRows = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.category || ''}|${row.storeId || ''}|${row.poNumber || ''}|${row.sku || ''}`;
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
    // Option B behavior: treat same PO in different categories as distinct.
    set.add(`${row.category || ''}|${row.storeId || ''}|${row.poNumber || ''}`);
  }
  return set.size;
};

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

const groupByDeliveryStatus = (rows, statusField = 'poDeliveryStatus') => {
  const map = new Map();
  for (const row of rows) {
    const status = row[statusField] || 'Unknown';
    map.set(status, (map.get(status) || 0) + 1);
  }
  return Array.from(map.entries()).map(([status, count]) => ({ status, count }));
};

/** True when any filter other than category is set. */
const hasNonCategoryFilters = (filters = {}) => {
  for (const field of FILTER_FIELDS) {
    if (field === 'category') continue;
    const value = filters[field];
    if (value !== undefined && value !== null && value !== '' && value !== 'All') {
      return true;
    }
  }
  return false;
};

const normalizeExecutiveFilters = (filters = {}) => {
  const normalized = {};
  for (const field of FILTER_FIELDS) {
    const value = filters[field];
    normalized[field] =
      value === undefined || value === null || value === '' ? 'All' : String(value);
  }
  return normalized;
};

const fetchRowsFromSource = async (collection, filters = {}) => {
  const Model = getPurchaseOrderModelByCollection(collection);
  const yearMonthFilter = filters.yearMonthPo;
  const match = buildMatch(filters);

  let rows = await Model.find(match).lean();
  const defaultStoreId = STORE_ID_BY_COLLECTION[collection];
  rows = rows.map((row) => normalizePoRow(row, defaultStoreId));

  if (yearMonthFilter && yearMonthFilter !== 'All') {
    rows = rows.filter((row) =>
      matchesDateFilter(resolvePoMonthKey(row), yearMonthFilter)
    );
  }

  return tagRowsWithCategory(rows, collection);
};

const fetchRowsFromDb = async (filters = {}) => {
  // Always load from both collections; apply category filter in-memory.
  // This guarantees "All" = SPS + Waitrose, and category selection works reliably.
  const sources = EXECUTIVE_COLLECTIONS;
  const chunks = await Promise.all(
    sources.map((source) => fetchRowsFromSource(source, filters))
  );
  const merged = chunks.flat();

  if (process.env.DEBUG_EXECUTIVE === '1') {
    const counts = sources.map((s, i) => `${s}:${chunks[i]?.length ?? 0}`).join(', ');
    console.log('[executive] sources=', counts, 'total=', merged.length);
  }

  return applyStoreIdFilter(applyCategoryFilter(merged, filters), filters);
};

const fetchAllRowsFromDb = async () => {
  const rows = await fetchRowsFromDb({});
  const responseBody = {
    success: true,
    data: {
      rowCount: rows.length,
      rows,
      lastUpdated: new Date().toISOString(),
    },
  };
  executiveCache.set(responseBody);
  return rows;
};

const loadFilteredRows = async (rawFilters = {}, { forceRefresh = false } = {}) => {
  const filters = normalizeExecutiveFilters(rawFilters);
  const key = filterCacheKey(filters);

  if (!forceRefresh) {
    const cached = filteredRowsCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.rows;
    }
    if (pendingRowLoads.has(key)) {
      return pendingRowLoads.get(key);
    }
  }

  const loadPromise = (async () => {
    let rows;

    if (!hasNonCategoryFilters(filters)) {
      // For Option B (All = SPS + Waitrose sum), always rebuild the "All" dataset
      // from both collections to avoid any stale single-source cache.
      if (filters.category === 'All') {
        rows = await fetchAllRowsFromDb();
      } else if (!forceRefresh) {
        const datasetCache = executiveCache.get();
        if (datasetCache?.data?.rows) {
          rows = datasetCache.data.rows;
        }
      }
      if (!rows) {
        rows = await fetchAllRowsFromDb();
      } else if (rows.length > 0 && !rows[0].category) {
        executiveCache.invalidate();
        rows = await fetchAllRowsFromDb();
      }
      if (filters.category !== 'All') {
        rows = applyCategoryFilter(rows, filters);
      }
      rows = applyStoreIdFilter(rows, filters);
    } else {
      rows = await fetchRowsFromDb(filters);
    }

    rows = applyStoreIdFilter(rows, filters);

    filteredRowsCache.set(key, {
      rows,
      expiresAt: Date.now() + FILTERED_ROWS_TTL_MS,
    });

    return rows;
  })().finally(() => {
    pendingRowLoads.delete(key);
  });

  pendingRowLoads.set(key, loadPromise);
  return loadPromise;
};

const buildOverview = (rows) => {
  const deduped = dedupeRows(rows);
  // KPI sums use every filtered row; only unique PO count dedupes PO identity.
  const skuPoQty = sumField(rows, 'skuQty');
  const skuInvoiceQty = sumInvoiceQty(rows);
  const poAmount = sumField(rows, 'poSales');
  const invoiceAmount = sumField(rows, 'totalSales') || sumField(rows, 'invoiceAmount');

  return {
    rowCount: rows.length,
    dedupedCount: deduped.length,
    summary: {
      uniqueDistributors: uniqueCount(rows, 'distributor'),
      uniqueRetailers: uniqueCount(rows, 'retailer'),
      uniqueLocations: uniqueCount(rows, 'location'),
    },
    kpiCards: {
      totalPoCount: uniquePoCount(rows),
      skuPoQty,
      poAmount,
      diffQty: skuPoQty - skuInvoiceQty,
      skuInvoiceQty,
      invoiceAmount,
      diffAmount: poAmount - invoiceAmount,
    },
    lists: buildDetailLists(rows),
  };
};

const buildBarCharts = (rows) => ({
  poSaleByRetailer: groupByPeriodRetailer(rows, 'poSales', 'poDate'),
  invoiceSaleByRetailer: groupByPeriodRetailer(rows, 'totalSales', 'commonInvoiceDate'),
});

const buildStatusCharts = (rows) => ({
  poDeliveryStatus: groupByDeliveryStatus(rows, 'poDeliveryStatus'),
  poStatusBreakdown: groupByDeliveryStatus(rows, 'poStatus'),
});

const invalidateCaches = () => {
  executiveCache.invalidate();
  filteredRowsCache.clear();
  pendingRowLoads.clear();
};

module.exports = {
  FILTER_FIELDS,
  buildMatch,
  normalizeExecutiveFilters,
  applyCategoryFilter,
  loadFilteredRows,
  buildOverview,
  buildBarCharts,
  buildStatusCharts,
  invalidateCaches,
};
