const mongoose = require('mongoose');
const {
  parsePage,
  parseLimit,
  parseCategory,
  parseChannelType,
  buildListPipeline,
  buildSummaryPipeline,
  buildStatusOptionsPipeline,
  resolvePrimaryModel,
  fetchMergedOrders,
  fetchMergedSummary,
  fetchMergedStatuses,
} = require('../utils/po-tracker.utils');
const {
  parsePoSource,
  buildUpdatePayload,
  buildChangeLog,
  buildHistoryEntry,
} = require('../utils/po-tracker-history.utils');
const { notifyPoTrackerUpdate } = require('../services/notification.service');

const emptySummary = () => ({
  totalPos: 0,
  pending: 0,
  cancelled: 0,
  shortShipped: 0,
  statusIssues: 0,
  withInvoice: 0,
  fulfilled: 0,
});

exports.getOrders = async (req, res) => {
  try {
    const channelType = parseChannelType(req.query.channelType);
    const category = parseCategory(req.query.category);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 25);
    const status = req.query.status || 'All';
    const search = req.query.search || '';

    let total;
    let totalPages;
    let rows;

    if (category === 'all') {
      const merged = await fetchMergedOrders({
        channelType,
        status,
        search,
        page,
        limit,
      });
      rows = merged.rows;
      total = merged.total;
      totalPages = merged.totalPages;
    } else {
      const PurchaseOrder = resolvePrimaryModel(category);
      const pipeline = buildListPipeline({
        channelType,
        category,
        status,
        search,
        page,
        limit,
      });

      const [result] = await PurchaseOrder.aggregate(pipeline).allowDiskUse(true);
      total = result?.metadata?.[0]?.total ?? 0;
      rows = result?.rows ?? [];
      totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    }

    return res.json({
      success: true,
      data: {
        channelType,
        category,
        page,
        limit,
        total,
        totalPages,
        rows,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('po-tracker getOrders error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load PO tracker orders' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const channelType = parseChannelType(req.query.channelType);
    const category = parseCategory(req.query.category);
    const status = req.query.status || 'All';
    const search = req.query.search || '';

    let summary;

    if (category === 'all') {
      summary = await fetchMergedSummary({ channelType, status, search });
    } else {
      const PurchaseOrder = resolvePrimaryModel(category);
      const pipeline = buildSummaryPipeline({
        channelType,
        category,
        status,
        search,
      });

      const [metrics] = await PurchaseOrder.aggregate(pipeline).allowDiskUse(true);
      summary = { ...emptySummary(), ...(metrics || {}) };
    }

    return res.json({
      success: true,
      data: {
        channelType,
        category,
        summary,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('po-tracker getSummary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load PO tracker summary' });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const poSource = parsePoSource(req.query.poSource);
    if (!poSource) {
      return res.status(400).json({
        success: false,
        message: 'poSource is required (sps or waitrose)',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const PurchaseOrder = resolvePrimaryModel(poSource);
    const row = await PurchaseOrder.findById(req.params.id).lean();

    if (!row) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    const history = Array.isArray(row.history)
      ? [...row.history].sort((a, b) => new Date(b.at) - new Date(a.at))
      : [];

    return res.json({
      success: true,
      data: {
        poSource,
        row: { ...row, history },
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('po-tracker getOrderById error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load purchase order' });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const poSource = parsePoSource(req.query.poSource);
    if (!poSource) {
      return res.status(400).json({
        success: false,
        message: 'poSource is required (sps or waitrose)',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const PurchaseOrder = resolvePrimaryModel(poSource);
    const before = await PurchaseOrder.findById(req.params.id).lean();

    if (!before) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    const payload = buildUpdatePayload(before, req.body);
    const changes = buildChangeLog(before, payload);

    if (changes.length === 0) {
      return res.json({
        success: true,
        data: {
          poSource,
          row: before,
          message: 'No changes detected',
          lastUpdated: new Date().toISOString(),
        },
      });
    }

    const historyEntry = buildHistoryEntry(req.user, changes);
    const row = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      {
        $set: payload,
        $push: { history: { $each: [historyEntry], $position: 0 } },
      },
      { new: true }
    ).lean();

    const channelType = req.query.channelType === 'b2b' ? 'b2b' : 'retail';
    notifyPoTrackerUpdate({
      actor: req.user,
      channelType,
      poSource,
      orderId: req.params.id,
      poNumber: row.poNumber || before.poNumber,
      changes,
    }).catch((err) => console.error('notifyPoTrackerUpdate error:', err.message));

    return res.json({
      success: true,
      data: {
        poSource,
        row,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('po-tracker updateOrder error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update purchase order' });
  }
};

exports.getFilters = async (req, res) => {
  try {
    const channelType = parseChannelType(req.query.channelType);
    const category = parseCategory(req.query.category);

    let statuses;

    if (category === 'all') {
      statuses = await fetchMergedStatuses({ channelType });
    } else {
      const PurchaseOrder = resolvePrimaryModel(category);
      const pipeline = buildStatusOptionsPipeline({ channelType, category });
      const rows = await PurchaseOrder.aggregate(pipeline).allowDiskUse(true);
      statuses = ['All', ...rows.map((s) => s._id).filter(Boolean)];
    }

    return res.json({
      success: true,
      data: {
        channelType,
        category,
        statuses,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('po-tracker getFilters error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load PO tracker filters' });
  }
};
