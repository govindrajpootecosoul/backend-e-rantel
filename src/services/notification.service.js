const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');

const channelLabel = (channelType) => (channelType === 'b2b' ? 'B2B' : 'Retails');

const formatChangeSummary = (changes = []) => {
  if (changes.length === 0) return 'Fields were updated.';
  const parts = changes.slice(0, 2).map((c) => `${c.field}: ${c.from} → ${c.to}`);
  const suffix = changes.length > 2 ? ` (+${changes.length - 2} more)` : '';
  return parts.join(' · ') + suffix;
};

/**
 * Notify all active users except the editor when a PO tracker row is updated.
 */
async function notifyPoTrackerUpdate({
  actor,
  channelType,
  poSource,
  orderId,
  poNumber,
  changes,
}) {
  const actorId = actor?.id ? String(actor.id) : '';
  const actorName = actor?.name || 'Someone';
  const actorEmail = actor?.email || '';

  const recipients = await User.find({
    status: { $ne: 'inactive' },
    ...(actorId && mongoose.Types.ObjectId.isValid(actorId)
      ? { _id: { $ne: new mongoose.Types.ObjectId(actorId) } }
      : {}),
  })
    .select('_id')
    .lean();

  if (recipients.length === 0) return;

  const label = channelLabel(channelType);
  const poLabel = poNumber || 'PO';
  const title = `${label} PO updated — ${poLabel}`;
  const message = `${actorName} updated ${poLabel} (${poSource.toUpperCase()}). ${formatChangeSummary(changes)}`;

  const docs = recipients.map((user) => ({
    recipientId: user._id,
    type: 'po_tracker_update',
    title,
    message,
    channelType,
    poSource,
    orderId: new mongoose.Types.ObjectId(String(orderId)),
    poNumber: poNumber || '',
    actorId,
    actorName,
    actorEmail,
    read: false,
  }));

  await Notification.insertMany(docs, { ordered: false });
}

module.exports = {
  notifyPoTrackerUpdate,
};
