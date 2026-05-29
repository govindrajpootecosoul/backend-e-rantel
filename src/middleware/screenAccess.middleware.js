const { hasScreenAccess } = require('../constants/screens');

const requireScreen = (screenId) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (!hasScreenAccess(req.user, screenId)) {
    return res.status(403).json({ success: false, message: 'You do not have access to this resource' });
  }
  return next();
};

module.exports = requireScreen;
