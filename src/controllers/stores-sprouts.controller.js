const crypto = require('crypto');
const SproutsChainStore = require('../models/SproutsChainStore');
const SproutsInventory = require('../models/SproutsInventory');
const SproutsRiskInventory = require('../models/SproutsRiskInventory');
const chainStoreService = require('../services/sprouts-chain-store.service');
const { parseUploadBuffer, parseGenericUploadBuffer } = require('../utils/kehe-import.utils');
const { parseInventoryUploadBuffer } = require('../utils/kehe-inventory-import.utils');
const { parseRiskInventoryUploadBuffer } = require('../utils/kehe-risk-inventory-import.utils');
const inventoryService = require('../services/sprouts-inventory.service');
const riskInventoryService = require('../services/sprouts-risk-inventory.service');
const { parseFiltersFromQuery, parsePage, parseLimit } = require('../utils/kehe-filters.utils');
const { parseRiskFiltersFromQuery } = require('../utils/kehe-risk-filters.utils');
const { releaseUploadFile } = require('../utils/upload.utils');

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
    return res.status(500).json({ success: false, message: 'Failed to load Sprouts filters' });
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
    return res.status(500).json({ success: false, message: 'Failed to load Sprouts summary' });
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
    return res.status(500).json({ success: false, message: 'Failed to load Sprouts rows' });
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
    releaseUploadFile(req);

    if (!docs.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows found. Check column headers match the Sprouts chain store template.',
      });
    }

    const batchId = crypto.randomUUID();
    const payload = docs.map((doc) => ({
      ...doc,
      importBatchId: batchId,
    }));

    if (mode === 'replace') {
      await SproutsChainStore.deleteMany({});
    }

    const inserted = await SproutsChainStore.insertMany(payload, { ordered: false });

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
    releaseUploadFile(req);

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
      importBatchId: batchId,
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

exports.uploadRiskInventory = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const mode = req.query.mode === 'replace' ? 'replace' : 'append';
    const { docs, skipped, totalRead } = parseRiskInventoryUploadBuffer(
      req.file.buffer,
      req.file.originalname
    );
    releaseUploadFile(req);

    if (!docs.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows found. Check column headers match the Sprouts risk inventory export.',
      });
    }

    const batchId = crypto.randomUUID();
    const payload = docs.map((doc) => ({
      ...doc,
      importBatchId: batchId,
    }));

    if (mode === 'replace') {
      await SproutsRiskInventory.deleteMany({});
    }

    const inserted = await SproutsRiskInventory.insertMany(payload, { ordered: false });

    return res.json({
      success: true,
      message: `Imported ${inserted.length} risk inventory rows (${mode})`,
      data: {
        mode,
        imported: inserted.length,
        skipped: skipped.length,
        totalRead,
        importBatchId: batchId,
      },
    });
  } catch (err) {
    console.error('uploadRiskInventory error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to import risk inventory file' });
  }
};

exports.getRiskInventoryFilters = async (req, res) => {
  try {
    const filters = parseRiskFiltersFromQuery(req.query);
    const options = await riskInventoryService.getFilterOptions(filters);
    const rowCount = await SproutsRiskInventory.estimatedDocumentCount();
    const wrapped = {};
    for (const [key, values] of Object.entries(options)) {
      wrapped[key] = ['All', ...values];
    }
    return res.json({
      success: true,
      data: { filterOptions: wrapped, rowCount, lastUpdated: new Date().toISOString() },
    });
  } catch (err) {
    console.error('getRiskInventoryFilters error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load risk filters' });
  }
};

exports.getRiskInventoryDashboard = async (req, res) => {
  try {
    const filters = parseRiskFiltersFromQuery(req.query);
    const dashboard = await riskInventoryService.getDashboard(filters);
    return res.json({
      success: true,
      data: { ...dashboard, lastUpdated: new Date().toISOString() },
    });
  } catch (err) {
    console.error('getRiskInventoryDashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load risk dashboard' });
  }
};

exports.uploadInventory = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const mode = req.query.mode === 'replace' ? 'replace' : 'append';
    const { docs, skipped, totalRead } = parseInventoryUploadBuffer(
      req.file.buffer,
      req.file.originalname
    );
    releaseUploadFile(req);

    if (!docs.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows found. Check column headers match the Sprouts inventory export.',
      });
    }

    const costMap = await inventoryService.getSkuUnitCosts();
    const batchId = crypto.randomUUID();
    const payload = await inventoryService.enrichVendorCosts(
      docs.map((doc) => ({
        ...doc,
        importBatchId: batchId,
      })),
      costMap
    );

    if (mode === 'replace') {
      await SproutsInventory.deleteMany({});
    }

    const inserted = await SproutsInventory.insertMany(payload, { ordered: false });

    return res.json({
      success: true,
      message: `Imported ${inserted.length} inventory rows (${mode})`,
      data: {
        mode,
        imported: inserted.length,
        skipped: skipped.length,
        totalRead,
        importBatchId: batchId,
      },
    });
  } catch (err) {
    console.error('uploadInventory error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to import inventory file' });
  }
};

exports.getInventoryFilters = async (req, res) => {
  try {
    const months = await inventoryService.getFilterOptions();
    const rowCount = await SproutsInventory.estimatedDocumentCount();
    return res.json({
      success: true,
      data: { months, rowCount, lastUpdated: new Date().toISOString() },
    });
  } catch (err) {
    console.error('getInventoryFilters error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load inventory filters' });
  }
};

exports.getInventoryDashboard = async (req, res) => {
  try {
    const reportMonth = req.query.reportMonth || 'All';
    const dashboard = await inventoryService.getDashboard(reportMonth);
    return res.json({
      success: true,
      data: { ...dashboard, lastUpdated: new Date().toISOString() },
    });
  } catch (err) {
    console.error('getInventoryDashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load inventory dashboard' });
  }
};

exports.getInventorySummary = async (req, res) => {
  try {
    const reportMonth = req.query.reportMonth || 'All';
    const dashboard = await inventoryService.getDashboard(reportMonth);
    return res.json({
      success: true,
      data: {
        rowCount: dashboard.rowCount,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('getInventorySummary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load inventory' });
  }
};

exports.getRiskInventorySummary = async (req, res) => {
  try {
    const filters = parseRiskFiltersFromQuery(req.query);
    const dashboard = await riskInventoryService.getDashboard(filters);
    return res.json({
      success: true,
      data: { rowCount: dashboard.rowCount, lastUpdated: new Date().toISOString() },
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
    const reportMonth = req.query.reportMonth;
    const query =
      reportMonth && reportMonth !== 'All' ? { reportMonth } : {};
    const total = await SproutsInventory.countDocuments(query);
    const rows = await SproutsInventory.find(query)
      .select('-__v')
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
    const filters = parseRiskFiltersFromQuery(req.query);
    const { buildRiskMatch } = require('../utils/kehe-risk-filters.utils');
    const query = buildRiskMatch(filters);
    const total = await SproutsRiskInventory.countDocuments(query);
    const rows = await SproutsRiskInventory.find(query)
      .select('-__v')
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
