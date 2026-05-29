const {
  normalizeScreenAccess,
  normalizeRoleForStorage,
} = require('../constants/screens');

const serializeUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: normalizeRoleForStorage(user.role),
  status: user.status,
  screenAccess: normalizeScreenAccess(user.screenAccess, user.role),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

module.exports = serializeUser;
