const SPS_FILTER_KEYS = [
  'channel',
  'poYearMonth',
  'invoiceYearMonth',
  'distributor',
  'retailer',
  'poNumber',
  'invoiceNumber',
  'sku',
  'poStatus',
  'status',
  'location',
  'warehouse',
  'poDate',
  'invoiceDate',
];

const DEFAULT_FILTERS = Object.fromEntries(SPS_FILTER_KEYS.map((k) => [k, 'All']));

const prependAll = (values) => [
  'All',
  ...Array.from(new Set(values)).filter(Boolean).sort(),
];

const parsePage = (value, fallback = 1) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const parseLimit = (value, fallback = 25) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 500);
};

const parseFiltersFromQuery = (query = {}) => {
  const filters = { ...DEFAULT_FILTERS };
  for (const key of SPS_FILTER_KEYS) {
    const value = query[key];
    if (value !== undefined && value !== null && value !== '') {
      filters[key] = String(value);
    }
  }
  return filters;
};

const computedFieldsStage = {
  $addFields: {
    _resolvedPoStatus: { $ifNull: ['$poStatus', { $ifNull: ['$newStatus', '$status'] }] },
    _resolvedStatus: { $ifNull: ['$newStatus', { $ifNull: ['$status', '$poStatus'] }] },
    _resolvedPoYearMonth: {
      $cond: {
        if: {
          $and: [{ $ne: ['$yearMonthPo', null] }, { $ne: ['$yearMonthPo', ''] }],
        },
        then: { $toString: '$yearMonthPo' },
        else: {
          $let: {
            vars: { d: { $ifNull: ['$commonPoDate', '$poDate'] } },
            in: {
              $cond: {
                if: { $ne: ['$$d', null] },
                then: {
                  $concat: [
                    { $toString: { $month: '$$d' } },
                    '/1/',
                    {
                      $substrCP: [
                        { $toString: { $year: '$$d' } },
                        { $max: [{ $subtract: [{ $strLenCP: { $toString: { $year: '$$d' } } }, 2] }, 0] },
                        2,
                      ],
                    },
                  ],
                },
                else: '',
              },
            },
          },
        },
      },
    },
    _resolvedInvoiceYearMonth: {
      $let: {
        vars: { d: { $ifNull: ['$commonInvoiceDate', '$invoiceDate'] } },
        in: {
          $cond: {
            if: { $ne: ['$$d', null] },
            then: {
              $concat: [
                { $toString: { $month: '$$d' } },
                '/1/',
                {
                  $substrCP: [
                    { $toString: { $year: '$$d' } },
                    { $max: [{ $subtract: [{ $strLenCP: { $toString: { $year: '$$d' } } }, 2] }, 0] },
                    2,
                  ],
                },
              ],
            },
            else: '',
          },
        },
      },
    },
    _poDateKey: {
      $cond: {
        if: { $ne: ['$poDate', null] },
        then: { $dateToString: { format: '%Y-%m-%d', date: '$poDate' } },
        else: '',
      },
    },
    _invoiceDateKey: {
      $cond: {
        if: { $ne: ['$invoiceDate', null] },
        then: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } },
        else: '',
      },
    },
    _poMonthKey: {
      $let: {
        vars: { d: { $ifNull: ['$commonPoDate', '$poDate'] } },
        in: {
          $cond: {
            if: { $ne: ['$$d', null] },
            then: { $dateToString: { format: '%Y-%m', date: '$$d' } },
            else: {
              $cond: {
                if: {
                  $and: [{ $ne: ['$yearMonthPo', null] }, { $ne: ['$yearMonthPo', ''] }],
                },
                then: {
                  $let: {
                    vars: {
                      parsed: {
                        $convert: {
                          input: '$yearMonthPo',
                          to: 'date',
                          onError: null,
                          onNull: null,
                        },
                      },
                    },
                    in: {
                      $cond: {
                        if: { $ne: ['$$parsed', null] },
                        then: { $dateToString: { format: '%Y-%m', date: '$$parsed' } },
                        else: '',
                      },
                    },
                  },
                },
                else: '',
              },
            },
          },
        },
      },
    },
    _invoiceMonthKey: {
      $let: {
        vars: { d: { $ifNull: ['$commonInvoiceDate', '$invoiceDate'] } },
        in: {
          $cond: {
            if: { $ne: ['$$d', null] },
            then: { $dateToString: { format: '%Y-%m', date: '$$d' } },
            else: '',
          },
        },
      },
    },
  },
};

const buildDateRangeMatch = (field, value) => {
  if (!value || value === 'All') return null;

  if (value.includes('..')) {
    const [fromRaw = '', toRaw = ''] = value.split('..');
    const from = fromRaw.trim();
    const to = toRaw.trim();

    if (from && to) return { [field]: { $gte: from, $lte: to } };
    if (from) return { [field]: { $gte: from } };
    if (to) return { [field]: { $lte: to } };
    return null;
  }

  return { [field]: value.trim() };
};

const buildFilterMatchStage = (filters = {}) => {
  const conditions = [];

  const directMap = {
    channel: 'channel',
    distributor: 'distributor',
    retailer: 'retailer',
    poNumber: 'poNumber',
    invoiceNumber: 'invoiceNumber',
    sku: 'sku',
    location: 'location',
    warehouse: 'warehouse',
  };

  for (const [filterKey, field] of Object.entries(directMap)) {
    const value = filters[filterKey];
    if (value && value !== 'All') conditions.push({ [field]: value });
  }

  const computedMap = {
    poStatus: '_resolvedPoStatus',
    status: '_resolvedStatus',
  };

  for (const [filterKey, field] of Object.entries(computedMap)) {
    const value = filters[filterKey];
    if (value && value !== 'All') conditions.push({ [field]: value });
  }

  const dateRangeMap = {
    poYearMonth: '_poMonthKey',
    invoiceYearMonth: '_invoiceMonthKey',
    poDate: '_poDateKey',
    invoiceDate: '_invoiceDateKey',
  };

  for (const [filterKey, field] of Object.entries(dateRangeMap)) {
    const value = filters[filterKey];
    const rangeMatch = buildDateRangeMatch(field, value);
    if (rangeMatch) conditions.push(rangeMatch);
  }

  if (conditions.length === 0) return { $match: {} };
  return { $match: { $and: conditions } };
};

const buildBasePipeline = (_storeId, filters = {}, type = 'po') => {
  const pipeline = [{ $match: {} }, computedFieldsStage, buildFilterMatchStage(filters)];

  if (type === 'invoice') {
    pipeline.push({
      $match: {
        invoiceNumber: { $exists: true, $nin: [null, ''] },
      },
    });
  }

  return pipeline;
};

const buildFilterOptionsFromGroup = (group = {}) => {
  const result = {};
  const fieldMap = {
    channel: 'channel',
    distributor: 'distributor',
    retailer: 'retailer',
    poNumber: 'poNumber',
    invoiceNumber: 'invoiceNumber',
    sku: 'sku',
    poStatus: '_resolvedPoStatus',
    status: '_resolvedStatus',
    location: 'location',
    warehouse: 'warehouse',
  };

  for (const [key, sourceField] of Object.entries(fieldMap)) {
    result[key] = prependAll(group[sourceField] || []);
  }

  return result;
};

module.exports = {
  SPS_FILTER_KEYS,
  DEFAULT_FILTERS,
  parsePage,
  parseLimit,
  parseFiltersFromQuery,
  buildBasePipeline,
  buildFilterOptionsFromGroup,
  prependAll,
  computedFieldsStage,
};
