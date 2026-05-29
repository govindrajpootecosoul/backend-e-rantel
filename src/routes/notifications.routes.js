const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const { list, markRead, markAllRead } = require('../controllers/notifications.controller');

const router = express.Router();

router.use(authMiddleware);
router.get('/', list);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
