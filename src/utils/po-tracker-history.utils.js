const EDITABLE_FIELDS = [
  { key: 'poNumber', label: 'PO Number' },
  { key: 'channel', label: 'Channel' },
  { key: 'distributor', label: 'Distributor' },
  { key: 'retailer', label: 'Retailer' },
  { key: 'sku', label: 'SKU' },
  { key: 'poDate', label: 'PO Date', date: true },
  { key: 'poRequestedDeliveryDate', label: 'Due Date', date: true },
  { key: 'location', label: 'Location' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'invoiceNumber', label: 'Invoice Number' },
  { key: 'invoiceAmount', label: 'Invoice Amount', number: true },
  { key: 'poLink', label: 'PO Link' },
  { key: 'status', label: 'Status' },
];

const { normalizeCategoryKey } = require('./category.utils');

const parsePoSource = (value) => {
  const key = normalizeCategoryKey(String(value || '').toLowerCase());
  if (key === 'waitrose') return 'waitrose';
  if (key === 'sps') return 'sps';
  return null;
};

/** Calendar date in UTC (YYYY-MM-DD) — avoids timezone false positives. */
const toUtcDateKey = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Parse <input type="date"> value as UTC noon (stable storage). */
const parseUtcDateInput = (str) => {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split('-').map((p) => Number(p));
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
};

const formatUtcDateKeyForDisplay = (key) => {
  if (!key) return '—';
  const [y, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
};

const normalizeDisplay = (value, fieldMeta) => {
  if (value === null || value === undefined || value === '') return '—';
  if (fieldMeta?.date) {
    return formatUtcDateKeyForDisplay(toUtcDateKey(value));
  }
  if (fieldMeta?.number) {
    return value === null || value === undefined ? '—' : String(value);
  }
  return String(value);
};

const readField = (doc, key) => {
  if (key === 'status') {
    return doc.newStatus || doc.status || doc.poStatus || '';
  }
  return doc[key];
};

const coerceIncoming = (key, value, fieldMeta) => {
  if (value === null || value === undefined || value === '') {
    return fieldMeta?.date ? null : fieldMeta?.number ? null : '';
  }
  if (fieldMeta?.date) {
    return parseUtcDateInput(String(value));
  }
  if (fieldMeta?.number) {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return String(value).trim();
};

const valuesEqual = (beforeVal, afterVal, fieldMeta) => {
  if (fieldMeta?.date) {
    return toUtcDateKey(beforeVal) === toUtcDateKey(afterVal);
  }
  if (fieldMeta?.number) {
    const a =
      beforeVal === null || beforeVal === undefined || beforeVal === ''
        ? null
        : Number(beforeVal);
    const b =
      afterVal === null || afterVal === undefined || afterVal === '' ? null : Number(afterVal);
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return a === b;
  }
  return String(beforeVal ?? '').trim() === String(afterVal ?? '').trim();
};

/** Only fields that truly changed (dates compared by calendar day in UTC). */
const buildUpdatePayload = (before, body = {}) => {
  const payload = {};

  for (const field of EDITABLE_FIELDS) {
    if (body[field.key] === undefined) continue;

    const incoming = coerceIncoming(field.key, body[field.key], field);
    const previous = readField(before, field.key);

    if (valuesEqual(previous, incoming, field)) continue;

    if (field.key === 'status') {
      payload.status = incoming;
      payload.poStatus = incoming;
      payload.newStatus = incoming;
    } else {
      payload[field.key] = incoming;
    }
  }

  if (Object.keys(payload).length === 0) {
    return {};
  }

  payload.updatedAt = new Date();
  return payload;
};

const buildChangeLog = (before, payload) => {
  const changes = [];

  for (const field of EDITABLE_FIELDS) {
    let incoming;
    if (field.key === 'status') {
      if (payload.status === undefined) continue;
      incoming = payload.status;
    } else if (payload[field.key] === undefined) {
      continue;
    } else {
      incoming = payload[field.key];
    }

    const previous = readField(before, field.key);
    if (valuesEqual(previous, incoming, field)) continue;

    changes.push({
      field: field.label,
      from: normalizeDisplay(previous, field),
      to: normalizeDisplay(incoming, field),
    });
  }

  return changes;
};

const buildHistoryEntry = (user, changes) => ({
  action: 'Entry updated',
  at: new Date(),
  by: {
    id: user?.id ? String(user.id) : '',
    name: user?.name || 'Unknown',
    email: user?.email || '',
  },
  changes,
});

module.exports = {
  EDITABLE_FIELDS,
  parsePoSource,
  buildUpdatePayload,
  buildChangeLog,
  buildHistoryEntry,
  toUtcDateKey,
};
