const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const {
  getFilters,
  getDashboard,
  getDataset,
  getOverview,
  getBarCharts,
  getStatusCharts,
} = require('../controllers/executive.controller');

const router = express.Router();

router.use(authMiddleware);
router.get('/dataset', getDataset);
router.get('/filters', getFilters);
router.post('/overview', getOverview);
router.post('/charts/bars', getBarCharts);
router.post('/charts/status', getStatusCharts);
router.post('/dashboard', getDashboard);

module.exports = router;
