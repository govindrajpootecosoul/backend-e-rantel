/** AK Status values (admin-only); blank allowed by default */
const AK_STATUS_OPTIONS = [
  'Complete',
  'Cancelled',
  'Order placed at warehouse',
  'Scheduled for pickup',
  'Not started',
];

const ADMIN_FIELD_KEYS = [
  'akStatus',
  'pickingList',
  'shippedBy',
  'signedBol',
  'pod',
  'trackingLink',
  'trackingId',
];

const normalizeAkStatus = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const match = AK_STATUS_OPTIONS.find((opt) => opt.toLowerCase() === trimmed.toLowerCase());
  return match || null;
};

module.exports = {
  AK_STATUS_OPTIONS,
  ADMIN_FIELD_KEYS,
  normalizeAkStatus,
};
