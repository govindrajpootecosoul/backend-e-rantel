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

const resolvePoMonthKey = (row) => {
  const d = row.commonPoDate || row.poDate;
  if (d) {
    const date = new Date(d);
    if (!Number.isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  }
  if (row.yearMonthPo) {
    const parsed = new Date(row.yearMonthPo);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  }
  return '';
};

module.exports = {
  parseDateFilter,
  matchesDateFilter,
  resolvePoMonthKey,
};
