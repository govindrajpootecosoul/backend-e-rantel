const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const requireSuperAdmin = require('../middleware/superAdmin.middleware');
const {
  listUsers,
  createUser,
  updateUser,
} = require('../controllers/users.controller');

const router = express.Router();

router.use(authMiddleware);
router.use(requireSuperAdmin);

router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);

module.exports = router;
