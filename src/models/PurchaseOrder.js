const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema(
  {
    storeId: String,
    distributor: String,
    retailer: String,
    poNumber: String,
    poDate: Date,
    poAmount: Number,
    poStatus: String,
    invoiceNumber: String,
    invoiceDate: Date,
    invoiceAmount: Number,
    yearMonthPo: String,
    delayDays: Number,
    poDeliveryStatus: String,
    sku: String,
    skuQty: Number,
    poSales: Number,
    totalSales: Number,
    location: String,
    warehouse: String,
    commonPoDate: Date,
    commonInvoiceDate: Date,
    invoiceQty: Number,
    status: String,
    updatedAt: Date,
  },
  {
    autoIndex: false,
    strict: false,
  }
);

const COLLECTION_BY_STORE = {
  sps: 'purchase_orders_sps',
  waitrose: 'purchase_orders_waitrose',
};

const normalizeStoreId = (storeId) => {
  const store = String(storeId || 'sps').toLowerCase();
  if (store === 'costco') return 'waitrose';
  return store;
};

const getPurchaseOrderModel = (storeId = 'sps') => {
  const store = normalizeStoreId(storeId);
  const collection = COLLECTION_BY_STORE[store] || COLLECTION_BY_STORE.sps;
  const modelName = `PurchaseOrder_${store}`;

  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }

  return mongoose.model(modelName, purchaseOrderSchema, collection);
};

const getPurchaseOrderModelByCollection = (collectionName) => {
  const collection = String(collectionName || '').trim();
  if (!collection) return getPurchaseOrderModel('sps');

  const modelName = `PurchaseOrder_${collection}`;
  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }
  return mongoose.model(modelName, purchaseOrderSchema, collection);
};

module.exports = getPurchaseOrderModel('sps');
module.exports.getPurchaseOrderModel = getPurchaseOrderModel;
module.exports.getPurchaseOrderModelByCollection = getPurchaseOrderModelByCollection;
module.exports.COLLECTION_BY_STORE = COLLECTION_BY_STORE;
