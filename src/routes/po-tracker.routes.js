const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const {
  getOrders,
  getSummary,
  getFilters,
} = require('../controllers/po-tracker.controller');

const router = express.Router();

router.use(authMiddleware);
router.get('/orders', getOrders);
router.get('/summary', getSummary);
router.get('/filters', getFilters);

module.exports = router;
