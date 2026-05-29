const { computedFieldsStage, parsePage, parseLimit } = require('./sps.utils');

const COLLECTIONS = {
  sps: 'purchase_orders_sps',
  costco: 'purchase_orders_costco',
};

const CHANNEL_MATCH = {
  b2b: { channel: { $regex: /^b2b$/i } },
  retail: { channel: { $regex: /retail/i } },
};

const parseCategory = (value) => {
  const key = String(value || 'all').toLowerCase();
  if (key === 'sps' || key === 'costco') return key;
  return 'all';
};

const parseChannelType = (value) => {
  const key = String(value || 'retail').toLowerCase();
  return key === 'b2b' ? 'b2b' : 'retail';
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSearchMatch = (search) => {
  const term = String(search || '').trim();
  if (!term) return null;

  const regex = { $regex: escapeRegex(term), $options: 'i' };
  return {
    $match: {
      $or: [
        { poNumber: regex },
        { distributor: regex },
        { retailer: regex },
        { sku: regex },
        { invoiceNumber: regex },
        { warehouse: regex },
      ],
    },
  };
};

const buildStatusMatch = (status) => {
  const value = String(status || '').trim();
  if (!value || value.toLowerCase() === 'all') return null;
  return {
    $match: {
      _resolvedStatus: { $regex: new RegExp(`^${escapeRegex(value)}$`, 'i') },
    },
  };
};

const buildChannelMatchStage = (channelType) => {
  const match = CHANNEL_MATCH[channelType];
  if (!match) return { $match: {} };
  return { $match: match };
};

const buildFilterStages = ({ status, search }) =>
  [computedFieldsStage, buildStatusMatch(status), buildSearchMatch(search)].filter(Boolean);

const channelPreMatchStages = (channelType) => {
  const stage = buildChannelMatchStage(channelType);
  if (!stage.$match || Object.keys(stage.$match).length === 0) return [];
  return [stage];
};

const tagPoSource = (poSource) => ({ $addFields: { _poSource: poSource } });

/** One collection only — no $unionWith. */
const buildSingleSourceStages = (poSource, channelType) => [
  ...channelPreMatchStages(channelType),
  tagPoSource(poSource),
];

const comparePoRows = (a, b) => {
  const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  if (tb !== ta) return tb - ta;
  return String(b._id).localeCompare(String(a._id));
};

const aggregateAllowDisk = (Model, pipeline) => Model.aggregate(pipeline).allowDiskUse(true);

const summaryGroupStages = [
  {
    $addFields: {
      _hasInvoice: {
        $cond: [
          {
            $and: [{ $ne: ['$invoiceNumber', null] }, { $ne: ['$invoiceNumber', ''] }],
          },
          1,
          0,
        ],
      },
      _isPending: {
        $cond: [
          {
            $regexMatch: {
              input: { $ifNull: ['$_resolvedStatus', ''] },
              regex: /pending/i,
            },
          },
          1,
          0,
        ],
      },
      _isIssue: {
        $cond: [
          {
            $or: [
              {
                $regexMatch: {
                  input: { $ifNull: ['$_resolvedStatus', ''] },
                  regex: /cancel/i,
                },
              },
              {
                $regexMatch: {
                  input: { $ifNull: ['$poDeliveryStatus', ''] },
                  regex: /issue|late|delay/i,
                },
              },
            ],
          },
          1,
          0,
        ],
      },
      _isFulfilled: {
        $cond: [
          {
            $regexMatch: {
              input: { $ifNull: ['$_resolvedStatus', ''] },
              regex: /fulfill/i,
            },
          },
          1,
          0,
        ],
      },
    },
  },
  {
    $group: {
      _id: { poSource: '$_poSource', poNumber: '$poNumber', sku: '$sku' },
      hasInvoice: { $max: '$_hasInvoice' },
      isPending: { $max: '$_isPending' },
      isIssue: { $max: '$_isIssue' },
      isFulfilled: { $max: '$_isFulfilled' },
    },
  },
  {
    $group: {
      _id: null,
      totalPos: { $sum: 1 },
      pending: { $sum: '$isPending' },
      statusIssues: { $sum: '$isIssue' },
      withInvoice: { $sum: '$hasInvoice' },
      fulfilled: { $sum: '$isFulfilled' },
    },
  },
];

const emptySummaryMetrics = () => ({
  totalPos: 0,
  pending: 0,
  statusIssues: 0,
  withInvoice: 0,
  fulfilled: 0,
});

const mergeSummaryMetrics = (a, b) => ({
  totalPos: (a.totalPos || 0) + (b.totalPos || 0),
  pending: (a.pending || 0) + (b.pending || 0),
  statusIssues: (a.statusIssues || 0) + (b.statusIssues || 0),
  withInvoice: (a.withInvoice || 0) + (b.withInvoice || 0),
  fulfilled: (a.fulfilled || 0) + (b.fulfilled || 0),
});

const buildListPipeline = ({ channelType, category, status, search, page, limit }) => {
  const skip = (page - 1) * limit;
  const poSource = category === 'costco' ? 'costco' : 'sps';

  return [
    ...buildSingleSourceStages(poSource, channelType),
    ...buildFilterStages({ status, search }),
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        rows: [
          { $sort: { updatedAt: -1, _id: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: { __v: 0 } },
        ],
      },
    },
  ];
};

const buildSummaryPipeline = ({ channelType, category, status, search }) => {
  const poSource = category === 'costco' ? 'costco' : 'sps';
  return [
    ...buildSingleSourceStages(poSource, channelType),
    ...buildFilterStages({ status, search }),
    ...summaryGroupStages,
  ];
};

const buildStatusOptionsPipeline = ({ channelType, category }) => {
  const poSource = category === 'costco' ? 'costco' : 'sps';
  return [
    ...buildSingleSourceStages(poSource, channelType),
    computedFieldsStage,
    { $group: { _id: '$_resolvedStatus' } },
    { $match: { _id: { $nin: [null, ''] } } },
    { $sort: { _id: 1 } },
  ];
};

const resolvePrimaryModel = (category) => {
  const { getPurchaseOrderModel } = require('../models/PurchaseOrder');
  if (category === 'costco') return getPurchaseOrderModel('costco');
  return getPurchaseOrderModel('sps');
};

const countOnCollection = async (Model, poSource, { channelType, status, search }) => {
  const pipeline = [
    ...buildSingleSourceStages(poSource, channelType),
    ...buildFilterStages({ status, search }),
    { $count: 'total' },
  ];
  const [result] = await aggregateAllowDisk(Model, pipeline);
  return result?.total ?? 0;
};

const listOnCollection = async (Model, poSource, { channelType, status, search }, fetchLimit) => {
  const pipeline = [
    ...buildSingleSourceStages(poSource, channelType),
    ...buildFilterStages({ status, search }),
    { $sort: { updatedAt: -1, _id: -1 } },
    { $limit: fetchLimit },
    { $project: { __v: 0 } },
  ];
  return aggregateAllowDisk(Model, pipeline);
};

const summaryOnCollection = async (Model, poSource, { channelType, status, search }) => {
  const pipeline = [
    ...buildSingleSourceStages(poSource, channelType),
    ...buildFilterStages({ status, search }),
    ...summaryGroupStages,
  ];
  const [metrics] = await aggregateAllowDisk(Model, pipeline);
  return { ...emptySummaryMetrics(), ...(metrics || {}) };
};

const statusesOnCollection = async (Model, poSource, { channelType }) => {
  const pipeline = buildStatusOptionsPipeline({ channelType, category: poSource });
  const rows = await aggregateAllowDisk(Model, pipeline);
  return rows.map((r) => r._id).filter(Boolean);
};

/** Category All: query each collection separately, merge in app (avoids $unionWith sort limits). */
const fetchMergedOrders = async ({ channelType, status, search, page, limit }) => {
  const spsModel = resolvePrimaryModel('sps');
  const costcoModel = resolvePrimaryModel('costco');
  const skip = (page - 1) * limit;
  const fetchLimit = skip + limit;
  const filters = { channelType, status, search };

  const [spsTotal, costcoTotal, spsRows, costcoRows] = await Promise.all([
    countOnCollection(spsModel, 'sps', filters),
    countOnCollection(costcoModel, 'costco', filters),
    listOnCollection(spsModel, 'sps', filters, fetchLimit),
    listOnCollection(costcoModel, 'costco', filters, fetchLimit),
  ]);

  const rows = [...spsRows, ...costcoRows].sort(comparePoRows).slice(skip, skip + limit);
  const total = spsTotal + costcoTotal;

  return {
    rows,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
};

const fetchMergedSummary = async ({ channelType, status, search }) => {
  const spsModel = resolvePrimaryModel('sps');
  const costcoModel = resolvePrimaryModel('costco');
  const filters = { channelType, status, search };

  const [spsSummary, costcoSummary] = await Promise.all([
    summaryOnCollection(spsModel, 'sps', filters),
    summaryOnCollection(costcoModel, 'costco', filters),
  ]);

  return mergeSummaryMetrics(spsSummary, costcoSummary);
};

const fetchMergedStatuses = async ({ channelType }) => {
  const spsModel = resolvePrimaryModel('sps');
  const costcoModel = resolvePrimaryModel('costco');
  const filters = { channelType };

  const [spsStatuses, costcoStatuses] = await Promise.all([
    statusesOnCollection(spsModel, 'sps', filters),
    statusesOnCollection(costcoModel, 'costco', filters),
  ]);

  return ['All', ...new Set([...spsStatuses, ...costcoStatuses])].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    return a.localeCompare(b);
  });
};

module.exports = {
  COLLECTIONS,
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
};
