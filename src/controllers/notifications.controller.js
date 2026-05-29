const mongoose = require('mongoose');
const Notification = require('../models/Notification');

exports.list = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 50);
    const recipientId = new mongoose.Types.ObjectId(userId);

    const [items, unreadCount] = await Promise.all([
      Notification.find({ recipientId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipientId, read: false }),
    ]);

    return res.json({
      success: true,
      data: {
        items,
        unreadCount,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('notifications list error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load notifications' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification id' });
    }

    await Notification.updateOne(
      {
        _id: id,
        recipientId: new mongoose.Types.ObjectId(userId),
      },
      { $set: { read: true } }
    );

    const unreadCount = await Notification.countDocuments({
      recipientId: new mongoose.Types.ObjectId(userId),
      read: false,
    });

    return res.json({
      success: true,
      data: { unreadCount, lastUpdated: new Date().toISOString() },
    });
  } catch (err) {
    console.error('notifications markRead error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    await Notification.updateMany(
      { recipientId: new mongoose.Types.ObjectId(userId), read: false },
      { $set: { read: true } }
    );

    return res.json({
      success: true,
      data: { unreadCount: 0, lastUpdated: new Date().toISOString() },
    });
  } catch (err) {
    console.error('notifications markAllRead error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
};
