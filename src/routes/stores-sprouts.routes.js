const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');
const { uploadLimiter } = require('../middleware/security.middleware');
const requireScreen = require('../middleware/screenAccess.middleware');
const {
  getChainStoreFilters,
  getChainStoreSummary,
  getChainStoreRows,
  uploadChainStore,
  uploadInventory,
  uploadRiskInventory,
  getInventoryFilters,
  getInventoryDashboard,
  getInventorySummary,
  getRiskInventoryFilters,
  getRiskInventoryDashboard,
  getRiskInventorySummary,
  getInventoryRows,
  getRiskInventoryRows,
} = require('../controllers/stores-sprouts.controller');

const router = express.Router();

router.use(authMiddleware);
router.use(requireScreen('stores_sprouts'));

router.get('/chain-store/filters', getChainStoreFilters);
router.get('/chain-store/summary', getChainStoreSummary);
router.get('/chain-store/rows', getChainStoreRows);
router.post('/chain-store/upload', uploadLimiter, upload.single('file'), uploadChainStore);

router.get('/inventory/filters', getInventoryFilters);
router.get('/inventory/dashboard', getInventoryDashboard);
router.get('/inventory/summary', getInventorySummary);
router.get('/inventory/rows', getInventoryRows);
router.post('/inventory/upload', uploadLimiter, upload.single('file'), uploadInventory);

router.get('/risk-inventory/filters', getRiskInventoryFilters);
router.get('/risk-inventory/dashboard', getRiskInventoryDashboard);
router.get('/risk-inventory/summary', getRiskInventorySummary);
router.get('/risk-inventory/rows', getRiskInventoryRows);
router.post('/risk-inventory/upload', uploadLimiter, upload.single('file'), uploadRiskInventory);

module.exports = router;
