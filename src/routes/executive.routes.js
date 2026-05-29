const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const {
  getFilters,
  getDashboard,
  getDataset,
} = require('../controllers/executive.controller');

const router = express.Router();

router.use(authMiddleware);
router.get('/dataset', getDataset);
router.get('/filters', getFilters);
router.post('/dashboard', getDashboard);

module.exports = router;
