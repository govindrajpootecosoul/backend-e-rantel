const {
  parsePage,
  parseLimit,
  parseCategory,
  parseChannelType,
  buildListPipeline,
  buildSummaryPipeline,
  buildStatusOptionsPipeline,
  resolvePrimaryModel,
} = require('../utils/po-tracker.utils');

const emptySummary = () => ({
  totalPos: 0,
  pending: 0,
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

    const PurchaseOrder = resolvePrimaryModel(category);
    const pipeline = buildListPipeline({
      channelType,
      category,
      status,
      search,
      page,
      limit,
    });

    const [result] = await PurchaseOrder.aggregate(pipeline);
    const total = result?.metadata?.[0]?.total ?? 0;
    const rows = result?.rows ?? [];

    return res.json({
      success: true,
      data: {
        channelType,
        category,
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
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

    const PurchaseOrder = resolvePrimaryModel(category);
    const pipeline = buildSummaryPipeline({
      channelType,
      category,
      status,
      search,
    });

    const [metrics] = await PurchaseOrder.aggregate(pipeline);
    const summary = { ...emptySummary(), ...(metrics || {}) };

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

exports.getFilters = async (req, res) => {
  try {
    const channelType = parseChannelType(req.query.channelType);
    const category = parseCategory(req.query.category);

    const PurchaseOrder = resolvePrimaryModel(category);
    const pipeline = buildStatusOptionsPipeline({ channelType, category });
    const statuses = await PurchaseOrder.aggregate(pipeline);

    return res.json({
      success: true,
      data: {
        channelType,
        category,
        statuses: ['All', ...statuses.map((s) => s._id).filter(Boolean)],
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('po-tracker getFilters error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load PO tracker filters' });
  }
};
