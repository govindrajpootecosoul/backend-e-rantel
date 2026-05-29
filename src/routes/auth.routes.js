const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const { signup, signin, getMe } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/signup', signup);
router.post('/signin', signin);
router.get('/me', authMiddleware, getMe);

module.exports = router;
