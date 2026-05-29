const User = require('../models/User');
const { isSuperAdmin } = require('../constants/screens');

/** Verifies super admin from DB (JWT role can be stale after role changes). */
const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (isSuperAdmin(req.user)) {
      return next();
    }

    const dbUser = await User.findById(req.user.id).select('role status').lean();
    if (!dbUser) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (dbUser.status && dbUser.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is not active' });
    }

    if (!isSuperAdmin(dbUser)) {
      return res.status(403).json({ success: false, message: 'Super admin access required' });
    }

    req.user.role = dbUser.role;
    return next();
  } catch (err) {
    console.error('requireSuperAdmin error:', err.message);
    return res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

module.exports = requireSuperAdmin;
