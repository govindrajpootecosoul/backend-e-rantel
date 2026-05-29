const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const {
  getOrders,
  getOrderById,
  updateOrder,
  getSummary,
  getFilters,
} = require('../controllers/po-tracker.controller');

const router = express.Router();

router.use(authMiddleware);
router.get('/orders', getOrders);
router.get('/orders/:id', getOrderById);
router.patch('/orders/:id', updateOrder);
router.get('/summary', getSummary);
router.get('/filters', getFilters);

module.exports = router;
