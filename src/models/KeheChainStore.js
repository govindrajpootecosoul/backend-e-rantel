const mongoose = require('mongoose');

const chainStoreSchema = new mongoose.Schema(
  {
    fileMonth: { type: String, default: '' },
    retailer: { type: String, default: '' },
    retailerArea: { type: String, default: '' },
    productDescription: { type: String, default: '' },
    fillRateVendorCost: { type: Number, default: null },
    orderedVendorCost: { type: Number, default: null },
    shippedVendorCost: { type: Number, default: null },
    upc: { type: String, default: '' },
    fillRateQuantity: { type: Number, default: null },
    orderedQuantity: { type: Number, default: null },
    shippedQuantity: { type: Number, default: null },
    fillRateListWholesale: { type: Number, default: null },
    orderedListWholesale: { type: Number, default: null },
    shippedListWholesale: { type: Number, default: null },
    sku: { type: String, default: '' },
    boxPerCase: { type: Number, default: null },
    material: { type: String, default: '' },
    productCategory: { type: String, default: '' },
    productSubCategory: { type: String, default: '' },
    productType: { type: String, default: '' },
    orderedCaseCostVendorCost: { type: Number, default: null },
    orderedCaseCostListWholesale: { type: Number, default: null },
    markup: { type: Number, default: null },
    importBatchId: { type: String, default: '' },
    sourceFileName: { type: String, default: '' },
  },
  {
    collection: 'kehe_chain_store',
    timestamps: true,
    autoIndex: false,
    strict: false,
  }
);

module.exports =
  mongoose.models.KeheChainStore || mongoose.model('KeheChainStore', chainStoreSchema);
