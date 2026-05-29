const crypto = require('crypto');
const KeheChainStore = require('../models/KeheChainStore');
const KeheInventory = require('../models/KeheInventory');
const KeheRiskInventory = require('../models/KeheRiskInventory');
const chainStoreService = require('../services/kehe-chain-store.service');
const { parseUploadBuffer, parseGenericUploadBuffer } = require('../utils/kehe-import.utils');
const { parseFiltersFromQuery, parsePage, parseLimit } = require('../utils/kehe-filters.utils');

exports.getChainStoreFilters = async (req, res) => {
  try {
    const filters = parseFiltersFromQuery(req.query);
    const filterOptions = await chainStoreService.getFilterOptions(filters);
    const totalRows = await chainStoreService.getTotalCount();

    const options = {};
    for (const [key, values] of Object.entries(filterOptions)) {
      options[key] = ['All', ...values];
    }

    return res.json({
      success: true,
      data: {
        totalRows,
        filterOptions: options,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('getChainStoreFilters error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load KeHE filters' });
  }
};

exports.getChainStoreSummary = async (req, res) => {
  try {
    const filters = parseFiltersFromQuery(req.query);
    const summary = await chainStoreService.getSummary(filters);
    const [byRetailer, byQuantity] = await Promise.all([
      chainStoreService.getRetailerVendorSummary(filters),
      chainStoreService.getQuantitySummary(filters),
    ]);

    return res.json({
      success: true,
      data: {
        summary,
        byRetailer,
        byQuantity,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('getChainStoreSummary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load KeHE summary' });
  }
};

exports.getChainStoreRows = async (req, res) => {
  try {
    const filters = parseFiltersFromQuery(req.query);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 25);
    const result = await chainStoreService.getRows(filters, page, limit);

    return res.json({
      success: true,
      data: {
        ...result,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('getChainStoreRows error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load KeHE rows' });
  }
};

exports.uploadChainStore = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const mode = req.query.mode === 'replace' ? 'replace' : 'append';
    const { docs, skipped, totalRead } = parseUploadBuffer(
      req.file.buffer,
      req.file.originalname
    );

    if (!docs.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows found. Check column headers match the KeHE chain store template.',
      });
    }

    const batchId = crypto.randomUUID();
    const payload = docs.map((doc) => ({
      ...doc,
      importBatchId: batchId,
      sourceFileName: req.file.originalname,
    }));

    if (mode === 'replace') {
      await KeheChainStore.deleteMany({});
    }

    const inserted = await KeheChainStore.insertMany(payload, { ordered: false });

    return res.json({
      success: true,
      message: `Imported ${inserted.length} rows (${mode})`,
      data: {
        mode,
        imported: inserted.length,
        skipped: skipped.length,
        totalRead,
        importBatchId: batchId,
      },
    });
  } catch (err) {
    console.error('uploadChainStore error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to import file' });
  }
};

const genericUpload = (Model, label) => async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const mode = req.query.mode === 'replace' ? 'replace' : 'append';
    const { docs, totalRead } = parseGenericUploadBuffer(
      req.file.buffer,
      req.file.originalname
    );

    if (!docs.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows found in file',
      });
    }

    const batchId = crypto.randomUUID();
    const payload = docs.map((doc) => ({
      fileMonth: doc.fileMonth || '',
      retailer: doc.retailer || '',
      retailerArea: doc.retailerArea || '',
      sku: doc.sku || '',
      upc: doc.upc || '',
      productDescription: doc.productDescription || '',
      material: doc.material || '',
      onHandQty: doc.onHandQty ?? doc.orderedQuantity ?? null,
      onOrderQty: doc.onOrderQty ?? null,
      riskLevel: doc.riskLevel || '',
      daysOfSupply: doc.daysOfSupply ?? null,
      raw: doc.raw || null,
      importBatchId: batchId,
      sourceFileName: req.file.originalname,
    }));

    if (mode === 'replace') {
      await Model.deleteMany({});
    }

    const inserted = await Model.insertMany(payload, { ordered: false });

    return res.json({
      success: true,
      message: `Imported ${inserted.length} ${label} rows (${mode})`,
      data: {
        mode,
        imported: inserted.length,
        totalRead,
        importBatchId: batchId,
      },
    });
  } catch (err) {
    console.error(`upload ${label} error:`, err.message);
    return res.status(500).json({ success: false, message: 'Failed to import file' });
  }
};

exports.uploadInventory = genericUpload(KeheInventory, 'inventory');
exports.uploadRiskInventory = genericUpload(KeheRiskInventory, 'risk inventory');

exports.getInventorySummary = async (req, res) => {
  try {
    const count = await KeheInventory.estimatedDocumentCount();
    return res.json({
      success: true,
      data: { rowCount: count, lastUpdated: new Date().toISOString() },
    });
  } catch (err) {
    console.error('getInventorySummary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load inventory' });
  }
};

exports.getRiskInventorySummary = async (req, res) => {
  try {
    const count = await KeheRiskInventory.estimatedDocumentCount();
    return res.json({
      success: true,
      data: { rowCount: count, lastUpdated: new Date().toISOString() },
    });
  } catch (err) {
    console.error('getRiskInventorySummary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load risk inventory' });
  }
};

exports.getInventoryRows = async (req, res) => {
  try {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 25);
    const skip = (page - 1) * limit;
    const total = await KeheInventory.countDocuments({});
    const rows = await KeheInventory.find({})
      .select('-__v -raw')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0, rows },
    });
  } catch (err) {
    console.error('getInventoryRows error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load inventory rows' });
  }
};

exports.getRiskInventoryRows = async (req, res) => {
  try {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 25);
    const skip = (page - 1) * limit;
    const total = await KeheRiskInventory.countDocuments({});
    const rows = await KeheRiskInventory.find({})
      .select('-__v -raw')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0, rows },
    });
  } catch (err) {
    console.error('getRiskInventoryRows error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load risk inventory rows' });
  }
};
