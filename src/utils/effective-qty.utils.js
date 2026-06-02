const { toFiniteNumber } = require('./sum-numeric.utils');

/** KPI invoice total = sum of Invoice_Qty column only (matches Excel SUM on Invoice_Qty). */
const effectiveInvoiceQty = (row) => toFiniteNumber(row.invoiceQty);

const sumInvoiceQty = (rows) => rows.reduce((acc, row) => acc + effectiveInvoiceQty(row), 0);

module.exports = {
  effectiveInvoiceQty,
  sumInvoiceQty,
};