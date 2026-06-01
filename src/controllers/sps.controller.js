const crypto = require('crypto');
const { getPurchaseOrderModel } = require('../models/PurchaseOrder');
const {
  parsePage,
  parseLimit,
  parseFiltersFromQuery,
  buildBasePipeline,
  buildFilterOptionsFromGroup,
} = require('../utils/sps.utils');
const { buildDetailLists } = require('../utils/kpi-detail-lists');
const { formatCategoryLabel } = require('../utils/category.utils');
const { parseUploadBuffer } = require('../utils/sps-import.utils');
const { releaseUploadFile } = require('../utils/upload.utils');

const SPS_PROJECTION =
  'storeId distributor retailer channel poNumber poDate poRequestedDeliveryDate poAmount poStatus invoiceNumber invoiceDate invoiceAmount shippingCity yearMonthPo delayDays poDeliveryStatus upcGtin sku skuQty poSales invoiceQty status totalSales location warehouse qtyDiff amtDiff unitListCost commonPoDate commonInvoiceDate newPoDeliveryStatus newStatus srp updatedAt createdAt';

const SUMMARY_PROJECTION =
  'storeId poNumber sku skuQty poSales invoiceQty totalSales qtyDiff amtDiff updatedAt';

const emptySummary = () => ({
  totalPoCount: 0,
  skuPoQty: 0,
  poAmount: 0,
  diffQty: 0,
  skuInvoiceQty: 0,
  invoiceAmount: 0,
  diffAmount: 0,
});

exports.getOrders = async (req, res) => {
  try {
    const storeId = (req.query.store || 'sps').toLowerCase();
    const PurchaseOrder = getPurchaseOrderModel(storeId);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 25);
    const type = req.query.type === 'invoice' ? 'invoice' : 'po';
    const filters = parseFiltersFromQuery(req.query);
    const skip = (page - 1) * limit;

    const pipeline = [
      ...buildBasePipeline(storeId, filters, type),
      { $sort: { updatedAt: -1, _id: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          rows: [{ $skip: skip }, { $limit: limit }, { $project: { __v: 0 } }],
        },
      },
    ];

    const [result] = await PurchaseOrder.aggregate(pipeline);
    const total = result?.metadata?.[0]?.total ?? 0;
    const rows = result?.rows ?? [];

    return res.json({
      success: true,
      data: {
        storeId,
        type,
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
        rows,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('getOrders error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load SPS orders' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const storeId = (req.query.store || 'sps').toLowerCase();
    const PurchaseOrder = getPurchaseOrderModel(storeId);
    const filters = parseFiltersFromQuery(req.query);

    const filteredPipeline = buildBasePipeline(storeId, filters, 'po');

    const [poCountResult, dedupedMetrics, dedupedRows] = await Promise.all([
      PurchaseOrder.aggregate([
        ...filteredPipeline,
        {
          $group: {
            _id: { storeId: '$storeId', poNumber: '$poNumber' },
          },
        },
        { $count: 'totalPoCount' },
      ]),
      PurchaseOrder.aggregate([
        ...filteredPipeline,
        { $sort: { updatedAt: -1, _id: -1 } },
        {
          $group: {
            _id: { storeId: '$storeId', poNumber: '$poNumber', sku: '$sku' },
            skuQty: { $first: '$skuQty' },
            poSales: { $first: '$poSales' },
            invoiceQty: { $first: '$invoiceQty' },
            totalSales: { $first: '$totalSales' },
            qtyDiff: { $first: '$qtyDiff' },
            amtDiff: { $first: '$amtDiff' },
          },
        },
        {
          $group: {
            _id: null,
            skuPoQty: { $sum: { $ifNull: ['$skuQty', 0] } },
            poAmount: { $sum: { $ifNull: ['$poSales', 0] } },
            diffQty: { $sum: { $ifNull: ['$qtyDiff', 0] } },
            skuInvoiceQty: { $sum: { $ifNull: ['$invoiceQty', 0] } },
            invoiceAmount: { $sum: { $ifNull: ['$totalSales', 0] } },
            diffAmount: { $sum: { $ifNull: ['$amtDiff', 0] } },
          },
        },
      ]),
      PurchaseOrder.aggregate([
        ...filteredPipeline,
        { $sort: { updatedAt: -1, _id: -1 } },
        {
          $group: {
            _id: { storeId: '$storeId', poNumber: '$poNumber', sku: '$sku' },
            storeId: { $first: '$storeId' },
            poNumber: { $first: '$poNumber' },
            sku: { $first: '$sku' },
            retailer: { $first: '$retailer' },
            distributor: { $first: '$distributor' },
            location: { $first: '$location' },
            skuQty: { $first: '$skuQty' },
            invoiceQty: { $first: '$invoiceQty' },
            poSales: { $first: '$poSales' },
            totalSales: { $first: '$totalSales' },
            invoiceAmount: { $first: '$invoiceAmount' },
          },
        },
      ]),
    ]);

    const categoryLabel = formatCategoryLabel(storeId);
    const listRows = dedupedRows.map((row) => ({
      category: categoryLabel,
      storeId: row.storeId,
      poNumber: row.poNumber,
      sku: row.sku,
      retailer: row.retailer,
      distributor: row.distributor,
      location: row.location,
      skuQty: row.skuQty,
      invoiceQty: row.invoiceQty,
      poSales: row.poSales,
      totalSales: row.totalSales,
      invoiceAmount: row.invoiceAmount,
    }));

    const summary = {
      ...emptySummary(),
      totalPoCount: poCountResult[0]?.totalPoCount ?? 0,
      ...(dedupedMetrics[0] || {}),
    };

    return res.json({
      success: true,
      data: {
        storeId,
        summary,
        lists: buildDetailLists(listRows),
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('getSummary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load SPS summary' });
  }
};

exports.getFilters = async (req, res) => {
  try {
    const storeId = (req.query.store || 'sps').toLowerCase();
    const PurchaseOrder = getPurchaseOrderModel(storeId);

    const [groupResult] = await PurchaseOrder.aggregate([
      { $match: {} },
      {
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
                              {
                                $max: [
                                  {
                                    $subtract: [
                                      { $strLenCP: { $toString: { $year: '$$d' } } },
                                      2,
                                    ],
                                  },
                                  0,
                                ],
                              },
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
                          {
                            $max: [
                              {
                                $subtract: [{ $strLenCP: { $toString: { $year: '$$d' } } }, 2],
                              },
                              0,
                            ],
                          },
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
        },
      },
      {
        $group: {
          _id: null,
          channel: { $addToSet: '$channel' },
          _resolvedPoYearMonth: { $addToSet: '$_resolvedPoYearMonth' },
          _resolvedInvoiceYearMonth: { $addToSet: '$_resolvedInvoiceYearMonth' },
          distributor: { $addToSet: '$distributor' },
          retailer: { $addToSet: '$retailer' },
          poNumber: { $addToSet: '$poNumber' },
          invoiceNumber: { $addToSet: '$invoiceNumber' },
          sku: { $addToSet: '$sku' },
          _resolvedPoStatus: { $addToSet: '$_resolvedPoStatus' },
          _resolvedStatus: { $addToSet: '$_resolvedStatus' },
          location: { $addToSet: '$location' },
          warehouse: { $addToSet: '$warehouse' },
          _poDateKey: { $addToSet: '$_poDateKey' },
          _invoiceDateKey: { $addToSet: '$_invoiceDateKey' },
        },
      },
    ]);

    const [countResult] = await PurchaseOrder.aggregate([{ $match: {} }, { $count: 'total' }]);

    return res.json({
      success: true,
      data: {
        storeId,
        totalRows: countResult?.total ?? 0,
        filterOptions: buildFilterOptionsFromGroup(groupResult || {}),
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('getFilters error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load SPS filters' });
  }
};

exports.uploadOrders = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const storeId = (req.query.store || 'sps').toLowerCase();
    const mode = req.query.mode === 'replace' ? 'replace' : 'append';
    const PurchaseOrder = getPurchaseOrderModel(storeId);

    const { docs, skipped, totalRead } = parseUploadBuffer(
      req.file.buffer,
      req.file.originalname,
      storeId
    );
    releaseUploadFile(req);

    if (!docs.length) {
      return res.status(400).json({
        success: false,
        message:
          'No valid rows found. Each row needs at least a PO Number or SKU. Check column headers match the PO/SO export.',
      });
    }

    const batchId = crypto.randomUUID();
    const payload = docs.map((doc) => ({
      ...doc,
      importBatchId: batchId,
    }));

    if (mode === 'replace') {
      await PurchaseOrder.deleteMany({});
    }

    const inserted = await PurchaseOrder.insertMany(payload, { ordered: false });
    const label = formatCategoryLabel(storeId);

    return res.json({
      success: true,
      message: `Imported ${inserted.length} ${label} rows (${mode})`,
      data: {
        storeId,
        mode,
        imported: inserted.length,
        skipped: skipped.length,
        totalRead,
        importBatchId: batchId,
      },
    });
  } catch (err) {
    releaseUploadFile(req);
    console.error('uploadOrders error:', err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.statusCode ? err.message : 'Failed to import PO/SO file',
    });
  }
};
