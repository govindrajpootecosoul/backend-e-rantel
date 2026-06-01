const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');
const { uploadLimiter } = require('../middleware/security.middleware');
const { getOrders, getSummary, getFilters, uploadOrders } = require('../controllers/sps.controller');

const router = express.Router();

router.use(authMiddleware);
router.get('/orders', getOrders);
router.get('/summary', getSummary);
router.get('/filters', getFilters);
router.post('/upload', uploadLimiter, upload.single('file'), uploadOrders);

module.exports = router;
