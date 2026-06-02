/** MongoDB $group expression: sum a field as double (handles string numbers from imports). */
const sumNumeric = (fieldPath) => ({
  $sum: {
    $convert: {
      input: fieldPath,
      to: 'double',
      onError: 0,
      onNull: 0,
    },
  },
});

const toFiniteNumber = (raw) => {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'object' && raw !== null && typeof raw.toString === 'function') {
    const n = Number(String(raw).replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(String(raw).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Sum a numeric column in plain JS rows (handles strings / Decimal128 from lean()). */
const sumField = (rows, field) =>
  rows.reduce((acc, row) => acc + toFiniteNumber(row[field]), 0);

module.exports = {
  sumNumeric,
  sumField,
  toFiniteNumber,
};
