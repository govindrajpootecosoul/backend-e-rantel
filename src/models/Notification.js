const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, default: 'po_tracker_update' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    channelType: { type: String, enum: ['b2b', 'retail'], required: true },
    poSource: { type: String, enum: ['sps', 'costco'], required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    poNumber: { type: String, default: '' },
    actorId: { type: String, default: '' },
    actorName: { type: String, default: '' },
    actorEmail: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'notifications',
    timestamps: true,
  }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
