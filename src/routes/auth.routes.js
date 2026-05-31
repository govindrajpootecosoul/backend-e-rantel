const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/security.middleware');
const { signup, signin, getMe } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/signup', authLimiter, signup);
router.post('/signin', authLimiter, signin);
router.get('/me', authMiddleware, getMe);

module.exports = router;
