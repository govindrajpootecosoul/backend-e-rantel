const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middleware/auth.middleware');
const requireScreen = require('../middleware/screenAccess.middleware');
const {
  getChainStoreFilters,
  getChainStoreSummary,
  getChainStoreRows,
  uploadChainStore,
  uploadInventory,
  uploadRiskInventory,
  getInventorySummary,
  getRiskInventorySummary,
  getInventoryRows,
  getRiskInventoryRows,
} = require('../controllers/stores-kehe.controller');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      name.endsWith('.csv') ||
      name.endsWith('.tsv') ||
      name.endsWith('.txt') ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls');
    if (!ok) {
      cb(new Error('Only .csv, .tsv, .txt, .xlsx, or .xls files are allowed'));
      return;
    }
    cb(null, true);
  },
});

router.use(authMiddleware);
router.use(requireScreen('stores_kehe'));

router.get('/chain-store/filters', getChainStoreFilters);
router.get('/chain-store/summary', getChainStoreSummary);
router.get('/chain-store/rows', getChainStoreRows);
router.post('/chain-store/upload', upload.single('file'), uploadChainStore);

router.get('/inventory/summary', getInventorySummary);
router.get('/inventory/rows', getInventoryRows);
router.post('/inventory/upload', upload.single('file'), uploadInventory);

router.get('/risk-inventory/summary', getRiskInventorySummary);
router.get('/risk-inventory/rows', getRiskInventoryRows);
router.post('/risk-inventory/upload', upload.single('file'), uploadRiskInventory);

module.exports = router;
