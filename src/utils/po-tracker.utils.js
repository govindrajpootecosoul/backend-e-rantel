const { computedFieldsStage, parsePage, parseLimit } = require('./sps.utils');

const COLLECTIONS = {
  sps: 'purchase_orders_sps',
  waitrose: 'purchase_orders_waitrose',
};

const CHANNEL_MATCH = {
  b2b: { channel: { $regex: /^b2b$/i } },
  retail: { channel: { $regex: /retail/i } },
};

const { normalizeCategoryKey } = require('./category.utils');

const parseCategory = (value) => {
  const key = normalizeCategoryKey(String(value || 'all').toLowerCase());
  if (key === 'sps' || key === 'waitrose') return key;
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
      _isCancelled: {
        $cond: [
          {
            $regexMatch: {
              input: { $ifNull: ['$_resolvedStatus', ''] },
              regex: /cancel/i,
            },
          },
          1,
          0,
        ],
      },
      _isShortShipped: {
        $cond: [
          {
            $regexMatch: {
              input: { $ifNull: ['$_resolvedStatus', ''] },
              regex: /short\s*shipped/i,
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
      isCancelled: { $max: '$_isCancelled' },
      isShortShipped: { $max: '$_isShortShipped' },
      isIssue: { $max: '$_isIssue' },
      isFulfilled: { $max: '$_isFulfilled' },
    },
  },
  {
    $group: {
      _id: null,
      totalPos: { $sum: 1 },
      pending: { $sum: '$isPending' },
      cancelled: { $sum: '$isCancelled' },
      shortShipped: { $sum: '$isShortShipped' },
      statusIssues: { $sum: '$isIssue' },
      withInvoice: { $sum: '$hasInvoice' },
      fulfilled: { $sum: '$isFulfilled' },
    },
  },
];

const emptySummaryMetrics = () => ({
  totalPos: 0,
  pending: 0,
  cancelled: 0,
  shortShipped: 0,
  statusIssues: 0,
  withInvoice: 0,
  fulfilled: 0,
});

const mergeSummaryMetrics = (a, b) => ({
  totalPos: (a.totalPos || 0) + (b.totalPos || 0),
  pending: (a.pending || 0) + (b.pending || 0),
  cancelled: (a.cancelled || 0) + (b.cancelled || 0),
  shortShipped: (a.shortShipped || 0) + (b.shortShipped || 0),
  statusIssues: (a.statusIssues || 0) + (b.statusIssues || 0),
  withInvoice: (a.withInvoice || 0) + (b.withInvoice || 0),
  fulfilled: (a.fulfilled || 0) + (b.fulfilled || 0),
});

const buildGroupByPoStages = () => [
  { $sort: { updatedAt: -1, _id: -1 } },
  {
    $group: {
      _id: { poSource: '$_poSource', poNumber: '$poNumber' },
      doc: { $first: '$$ROOT' },
      skus: { $addToSet: '$sku' },
    },
  },
  {
    $addFields: {
      'doc.skus': {
        $filter: {
          input: '$skus',
          as: 'sku',
          cond: { $and: [{ $ne: ['$$sku', null] }, { $ne: ['$$sku', ''] }] },
        },
      },
    },
  },
  { $replaceRoot: { newRoot: '$doc' } },
];

const buildListPipeline = ({ channelType, category, status, search, page, limit }) => {
  const skip = (page - 1) * limit;
  const poSource = category === 'waitrose' ? 'waitrose' : 'sps';

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

const buildListPipelineGroupedByPo = ({ channelType, category, status, search, page, limit }) => {
  const skip = (page - 1) * limit;
  const poSource = category === 'waitrose' ? 'waitrose' : 'sps';

  const base = [
    ...buildSingleSourceStages(poSource, channelType),
    ...buildFilterStages({ status, search }),
    ...buildGroupByPoStages(),
    { $project: { __v: 0 } },
  ];

  return [
    {
      $facet: {
        metadata: [...base, { $count: 'total' }],
        rows: [...base, { $skip: skip }, { $limit: limit }],
      },
    },
  ];
};

const buildSummaryPipeline = ({ channelType, category, status, search }) => {
  const poSource = category === 'waitrose' ? 'waitrose' : 'sps';
  return [
    ...buildSingleSourceStages(poSource, channelType),
    ...buildFilterStages({ status, search }),
    ...summaryGroupStages,
  ];
};

const buildStatusOptionsPipeline = ({ channelType, category }) => {
  const poSource = category === 'waitrose' ? 'waitrose' : 'sps';
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
  if (category === 'waitrose') return getPurchaseOrderModel('waitrose');
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

const countGroupedOnCollection = async (Model, poSource, { channelType, status, search }) => {
  const pipeline = [
    ...buildSingleSourceStages(poSource, channelType),
    ...buildFilterStages({ status, search }),
    ...buildGroupByPoStages(),
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

const listGroupedOnCollection = async (
  Model,
  poSource,
  { channelType, status, search },
  fetchLimit
) => {
  const pipeline = [
    ...buildSingleSourceStages(poSource, channelType),
    ...buildFilterStages({ status, search }),
    ...buildGroupByPoStages(),
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
  const waitroseModel = resolvePrimaryModel('waitrose');
  const skip = (page - 1) * limit;
  const fetchLimit = skip + limit;
  const filters = { channelType, status, search };

  const [spsTotal, waitroseTotal, spsRows, waitroseRows] = await Promise.all([
    countOnCollection(spsModel, 'sps', filters),
    countOnCollection(waitroseModel, 'waitrose', filters),
    listOnCollection(spsModel, 'sps', filters, fetchLimit),
    listOnCollection(waitroseModel, 'waitrose', filters, fetchLimit),
  ]);

  const rows = [...spsRows, ...waitroseRows].sort(comparePoRows).slice(skip, skip + limit);
  const total = spsTotal + waitroseTotal;

  return {
    rows,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
};

const fetchMergedOrdersGroupedByPo = async ({ channelType, status, search, page, limit }) => {
  const spsModel = resolvePrimaryModel('sps');
  const waitroseModel = resolvePrimaryModel('waitrose');
  const skip = (page - 1) * limit;
  const fetchLimit = skip + limit;
  const filters = { channelType, status, search };

  const [spsTotal, waitroseTotal, spsRows, waitroseRows] = await Promise.all([
    countGroupedOnCollection(spsModel, 'sps', filters),
    countGroupedOnCollection(waitroseModel, 'waitrose', filters),
    listGroupedOnCollection(spsModel, 'sps', filters, fetchLimit),
    listGroupedOnCollection(waitroseModel, 'waitrose', filters, fetchLimit),
  ]);

  const rows = [...spsRows, ...waitroseRows].sort(comparePoRows).slice(skip, skip + limit);
  const total = spsTotal + waitroseTotal;

  return {
    rows,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
};

const fetchMergedSummary = async ({ channelType, status, search }) => {
  const spsModel = resolvePrimaryModel('sps');
  const waitroseModel = resolvePrimaryModel('waitrose');
  const filters = { channelType, status, search };

  const [spsSummary, waitroseSummary] = await Promise.all([
    summaryOnCollection(spsModel, 'sps', filters),
    summaryOnCollection(waitroseModel, 'waitrose', filters),
  ]);

  return mergeSummaryMetrics(spsSummary, waitroseSummary);
};

const fetchMergedStatuses = async ({ channelType }) => {
  const spsModel = resolvePrimaryModel('sps');
  const waitroseModel = resolvePrimaryModel('waitrose');
  const filters = { channelType };

  const [spsStatuses, waitroseStatuses] = await Promise.all([
    statusesOnCollection(spsModel, 'sps', filters),
    statusesOnCollection(waitroseModel, 'waitrose', filters),
  ]);

  return ['All', ...new Set([...spsStatuses, ...waitroseStatuses])].sort((a, b) => {
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
  buildListPipelineGroupedByPo,
  buildSummaryPipeline,
  buildStatusOptionsPipeline,
  resolvePrimaryModel,
  fetchMergedOrders,
  fetchMergedOrdersGroupedByPo,
  fetchMergedSummary,
  fetchMergedStatuses,
};
