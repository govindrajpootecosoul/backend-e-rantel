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
      _resolvedStatus: value,
    },
  };
};

const buildChannelMatchStage = (channelType) => {
  const match = CHANNEL_MATCH[channelType];
  if (!match) return { $match: {} };
  return { $match: match };
};

const buildFilterStages = ({ channelType, status, search }) =>
  [
    buildChannelMatchStage(channelType),
    computedFieldsStage,
    buildStatusMatch(status),
    buildSearchMatch(search),
  ].filter(Boolean);

const buildStoreIdMatch = (category) => {
  if (category === 'sps' || category === 'costco') {
    return {
      $match: {
        storeId: { $regex: new RegExp(`^${category}$`, 'i') },
      },
    };
  }
  return null;
};

const buildSourceStages = (category) => {
  if (category === 'all') {
    return [
      { $match: {} },
      {
        $unionWith: {
          coll: COLLECTIONS.costco,
          pipeline: [{ $match: {} }],
        },
      },
    ];
  }
  return [buildStoreIdMatch(category)].filter(Boolean);
};

const buildListPipeline = ({ channelType, category, status, search, page, limit }) => {
  const skip = (page - 1) * limit;

  return [
    ...buildSourceStages(category),
    ...buildFilterStages({ channelType, status, search }),
    { $sort: { updatedAt: -1, _id: -1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        rows: [{ $skip: skip }, { $limit: limit }, { $project: { __v: 0 } }],
      },
    },
  ];
};

const buildSummaryPipeline = ({ channelType, category, status, search }) => [
  ...buildSourceStages(category),
  ...buildFilterStages({ channelType, status, search }),
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
      _id: { storeId: '$storeId', poNumber: '$poNumber', sku: '$sku' },
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

const buildStatusOptionsPipeline = ({ channelType, category }) => [
  ...buildSourceStages(category),
  buildChannelMatchStage(channelType),
  computedFieldsStage,
  { $group: { _id: '$_resolvedStatus' } },
  { $match: { _id: { $nin: [null, ''] } } },
  { $sort: { _id: 1 } },
];

const resolvePrimaryModel = (category) => {
  const { getPurchaseOrderModel } = require('../models/PurchaseOrder');
  if (category === 'costco') return getPurchaseOrderModel('costco');
  return getPurchaseOrderModel('sps');
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
};
