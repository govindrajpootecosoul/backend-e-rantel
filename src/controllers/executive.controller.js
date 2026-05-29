const { getPurchaseOrderModelByCollection } = require('../models/PurchaseOrder');
const executiveCache = require('../services/executiveCache');
const executiveService = require('../services/executive.service');

const FILTER_FIELDS = executiveService.FILTER_FIELDS;
const EXECUTIVE_MODELS = [
  getPurchaseOrderModelByCollection('purchase_orders_sps'),
  getPurchaseOrderModelByCollection('purchase_orders_costco'),
];
const prependAll = (arr) => ['All', ...arr.filter(Boolean).sort()];

const lastUpdated = () => new Date().toISOString();

const mergeDistinct = async (field) => {
  const lists = await Promise.all(
    EXECUTIVE_MODELS.map((Model) => Model.distinct(field).lean())
  );
  return [...new Set(lists.flat())];
};

exports.getFilters = async (req, res) => {
  try {
    const filters = { category: ['All', 'SPS', 'Costco'] };

    for (const field of FILTER_FIELDS) {
      if (field === 'category') continue;
      if (field === 'yearMonthPo') {
        filters[field] = ['All'];
        continue;
      }

      let values =
        field === 'delayDays'
          ? await mergeDistinct('delayDays')
          : await mergeDistinct(field);

      if (field === 'delayDays') {
        values = values.map((v) => String(v));
      } else {
        values = values.map((v) => String(v));
      }
      filters[field] = prependAll(values);
    }

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

    executiveService.invalidateCaches();
    const rows = await executiveService.loadFilteredRows({}, { forceRefresh: true });

    const responseBody = {
      success: true,
      data: {
        rowCount: rows.length,
        rows,
        lastUpdated: lastUpdated(),
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

exports.getOverview = async (req, res) => {
  try {
    const filters = req.body?.filters || req.body || {};
    const forceRefresh = req.query.refresh === '1';
    const rows = await executiveService.loadFilteredRows(filters, { forceRefresh });
    const overview = executiveService.buildOverview(rows);

    return res.json({
      success: true,
      data: {
        ...overview,
        lastUpdated: lastUpdated(),
      },
    });
  } catch (err) {
    console.error('getOverview error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load overview' });
  }
};

exports.getBarCharts = async (req, res) => {
  try {
    const filters = req.body?.filters || req.body || {};
    const forceRefresh = req.query.refresh === '1';
    const rows = await executiveService.loadFilteredRows(filters, { forceRefresh });
    const charts = executiveService.buildBarCharts(rows);

    return res.json({
      success: true,
      data: {
        charts,
        lastUpdated: lastUpdated(),
      },
    });
  } catch (err) {
    console.error('getBarCharts error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load bar charts' });
  }
};

exports.getStatusCharts = async (req, res) => {
  try {
    const filters = req.body?.filters || req.body || {};
    const forceRefresh = req.query.refresh === '1';
    const rows = await executiveService.loadFilteredRows(filters, { forceRefresh });
    const charts = executiveService.buildStatusCharts(rows);

    return res.json({
      success: true,
      data: {
        charts,
        lastUpdated: lastUpdated(),
      },
    });
  } catch (err) {
    console.error('getStatusCharts error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load status charts' });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const filters = req.body?.filters || req.body || {};
    const rows = await executiveService.loadFilteredRows(filters);
    const overview = executiveService.buildOverview(rows);
    const barCharts = executiveService.buildBarCharts(rows);
    const statusCharts = executiveService.buildStatusCharts(rows);

    return res.json({
      success: true,
      data: {
        ...overview,
        charts: {
          ...barCharts,
          ...statusCharts,
        },
        lastUpdated: lastUpdated(),
      },
    });
  } catch (err) {
    console.error('getDashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard data' });
  }
};
