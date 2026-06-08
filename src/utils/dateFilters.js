const parseDateFilter = (value) => {
  if (!value || value === 'All') {
    return { from: '', to: '', isRange: false };
  }
  if (value.includes('..')) {
    const [from = '', to = ''] = value.split('..');
    return { from, to, isRange: true };
  }
  return { from: value, to: value, isRange: false };
};

const matchesDateFilter = (value, filter) => {
  if (!filter || filter === 'All') return true;
  if (!value) return false;

  const { from, to, isRange } = parseDateFilter(filter);

  if (!isRange) {
    const target = from || to;
    return value === target;
  }

  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
};

const { parsePeriodLabel } = require('./po-row-normalize.utils');

const resolveYearMonthFromValue = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  const isoMonth = raw.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) return `${isoMonth[1]}-${isoMonth[2]}`;

  const parsed = parsePeriodLabel(value) || new Date(value);
  if (parsed && !Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return '';
};

const resolvePoMonthKey = (row) => {
  const fromYearMonth = resolveYearMonthFromValue(row.yearMonthPo);
  if (fromYearMonth) return fromYearMonth;

  const d = row.commonPoDate || row.poDate;
  return resolveYearMonthFromValue(d);
};

module.exports = {
  parseDateFilter,
  matchesDateFilter,
  resolvePoMonthKey,
};
