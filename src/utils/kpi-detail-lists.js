const { formatCategoryLabel } = require('./category.utils');

const uniqueList = (rows, field) => {
  const set = new Set();
  for (const row of rows) {
    const val = row[field];
    if (val !== undefined && val !== null && val !== '') set.add(String(val));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

const buildPurchaseOrderList = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.category || ''}|${row.storeId || ''}|${row.poNumber || ''}`;
    if (!key.endsWith('||') && !map.has(key)) {
      map.set(key, {
        category: formatCategoryLabel(row.category || '—'),
        storeId: row.storeId || '—',
        poNumber: row.poNumber || '—',
        poSales: Number(row.poSales) || 0,
        totalSales: Number(row.totalSales) || Number(row.invoiceAmount) || 0,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.poNumber.localeCompare(b.poNumber));
};

const buildSkuList = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const sku = row.sku ? String(row.sku) : '—';
    const existing = map.get(sku);
    if (!existing) {
      map.set(sku, {
        sku,
        retailer: row.retailer || '—',
        skuQty: Number(row.skuQty) || 0,
        invoiceQty: Number(row.invoiceQty) || 0,
        poSales: Number(row.poSales) || 0,
        totalSales: Number(row.totalSales) || Number(row.invoiceAmount) || 0,
      });
      continue;
    }
    existing.skuQty += Number(row.skuQty) || 0;
    existing.invoiceQty += Number(row.invoiceQty) || 0;
    existing.poSales += Number(row.poSales) || 0;
    existing.totalSales += Number(row.totalSales) || Number(row.invoiceAmount) || 0;
  }
  return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
};

const buildDetailLists = (rows) => ({
  distributors: uniqueList(rows, 'distributor'),
  retailers: uniqueList(rows, 'retailer'),
  locations: uniqueList(rows, 'location'),
  purchaseOrders: buildPurchaseOrderList(rows),
  skus: buildSkuList(rows),
});

module.exports = {
  uniqueList,
  buildPurchaseOrderList,
  buildSkuList,
  buildDetailLists,
};
