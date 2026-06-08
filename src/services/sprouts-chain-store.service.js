const SproutsChainStore = require('../models/SproutsChainStore');
const {
  chainStorePipelinePrefix,
  normalizeChainStoreRows,
} = require('../utils/chain-store-normalize.utils');

exports.getFilterOptions = async (filters = {}) => {
  const pipeline = [
    ...chainStorePipelinePrefix(filters),
    {
      $group: {
        _id: null,
        fileMonth: { $addToSet: '$fileMonth' },
        retailer: { $addToSet: '$retailer' },
        retailerArea: { $addToSet: '$retailerArea' },
        sku: { $addToSet: '$sku' },
        upc: { $addToSet: '$upc' },
        material: { $addToSet: '$material' },
      },
    },
  ];

  const [result] = await SproutsChainStore.aggregate(pipeline);
  const sortValues = (arr = []) =>
    [...new Set(arr.filter((v) => v && String(v).trim()))].sort((a, b) =>
      String(a).localeCompare(String(b))
    );

  return {
    fileMonth: sortValues(result?.fileMonth),
    retailer: sortValues(result?.retailer),
    retailerArea: sortValues(result?.retailerArea),
    sku: sortValues(result?.sku),
    upc: sortValues(result?.upc),
    material: sortValues(result?.material),
  };
};

exports.getSummary = async (filters = {}) => {
  const pipeline = [
    ...chainStorePipelinePrefix(filters),
    {
      $group: {
        _id: null,
        orderedVendorCost: { $sum: { $ifNull: ['$orderedVendorCost', 0] } },
        shippedVendorCost: { $sum: { $ifNull: ['$shippedVendorCost', 0] } },
        orderedQuantity: { $sum: { $ifNull: ['$orderedQuantity', 0] } },
        shippedQuantity: { $sum: { $ifNull: ['$shippedQuantity', 0] } },
        markupSum: { $sum: { $ifNull: ['$markup', 0] } },
        markupCount: { $sum: { $cond: [{ $gt: ['$markup', 0] }, 1, 0] } },
        retailers: { $addToSet: '$retailer' },
        skus: { $addToSet: '$sku' },
        upcs: { $addToSet: '$upc' },
        rowCount: { $sum: 1 },
      },
    },
  ];

  const [agg] = await SproutsChainStore.aggregate(pipeline);
  const orderedVendorCost = agg?.orderedVendorCost ?? 0;
  const shippedVendorCost = agg?.shippedVendorCost ?? 0;
  const fillRateVendorCost =
    orderedVendorCost > 0 ? Math.round((shippedVendorCost / orderedVendorCost) * 100) : 0;
  const markupRaw = agg?.markupCount > 0 ? agg.markupSum / agg.markupCount : 0;
  const markupAvg =
    markupRaw > 0 && markupRaw <= 1
      ? Math.round(markupRaw * 1000) / 10
      : Math.round(markupRaw * 10) / 10;

  const retailers = (agg?.retailers ?? []).filter(Boolean);
  const skus = (agg?.skus ?? []).filter(Boolean);
  const upcs = (agg?.upcs ?? []).filter(Boolean);

  return {
    orderedVendorCost,
    shippedVendorCost,
    fillRateVendorCost,
    markupAvg,
    retailerCount: retailers.length,
    storeCount: upcs.length,
    skuCount: skus.length,
    rowCount: agg?.rowCount ?? 0,
  };
};

exports.getRetailerVendorSummary = async (filters = {}, limit = 50) => {
  const pipeline = [
    ...chainStorePipelinePrefix(filters),
    {
      $group: {
        _id: { retailer: '$retailer', retailerArea: '$retailerArea' },
        storeCount: { $addToSet: '$upc' },
        skuCount: { $addToSet: '$sku' },
        orderedVendorCost: { $sum: { $ifNull: ['$orderedVendorCost', 0] } },
        shippedVendorCost: { $sum: { $ifNull: ['$shippedVendorCost', 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        retailer: '$_id.retailer',
        retailerArea: '$_id.retailerArea',
        storeCount: { $size: '$storeCount' },
        skuCount: { $size: '$skuCount' },
        orderedVendorCost: 1,
        shippedVendorCost: 1,
        difference: { $subtract: ['$orderedVendorCost', '$shippedVendorCost'] },
      },
    },
    { $sort: { orderedVendorCost: -1 } },
    { $limit: limit },
  ];

  return SproutsChainStore.aggregate(pipeline);
};

exports.getQuantitySummary = async (filters = {}, limit = 50) => {
  const pipeline = [
    ...chainStorePipelinePrefix(filters),
    {
      $group: {
        _id: { sku: '$sku', retailer: '$retailer', retailerArea: '$retailerArea' },
        storeCount: { $addToSet: '$upc' },
        orderedQuantity: { $sum: { $ifNull: ['$orderedQuantity', 0] } },
        shippedQuantity: { $sum: { $ifNull: ['$shippedQuantity', 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        sku: '$_id.sku',
        retailer: '$_id.retailer',
        retailerArea: '$_id.retailerArea',
        storeCount: { $size: '$storeCount' },
        orderedQuantity: 1,
        shippedQuantity: 1,
        diffQty: { $subtract: ['$orderedQuantity', '$shippedQuantity'] },
      },
    },
    { $sort: { orderedQuantity: -1 } },
    { $limit: limit },
  ];

  return SproutsChainStore.aggregate(pipeline);
};

exports.getRows = async (filters = {}, page = 1, limit = 25) => {
  const { buildMatchStage } = require('../utils/kehe-filters.utils');
  const match = buildMatchStage(filters);
  const query = match ? match.$match : {};
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    SproutsChainStore.countDocuments(query),
    SproutsChainStore.find(query)
      .select('-__v')
      .sort({ updatedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    rows: normalizeChainStoreRows(rows),
  };
};

exports.getTotalCount = async () => SproutsChainStore.estimatedDocumentCount();
