const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    fileMonth: { type: String, default: '' },
    retailer: { type: String, default: '' },
    retailerArea: { type: String, default: '' },
    sku: { type: String, default: '' },
    upc: { type: String, default: '' },
    productDescription: { type: String, default: '' },
    material: { type: String, default: '' },
    onHandQty: { type: Number, default: null },
    onOrderQty: { type: Number, default: null },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
    importBatchId: { type: String, default: '' },
    sourceFileName: { type: String, default: '' },
  },
  {
    collection: 'kehe_inventory',
    timestamps: true,
    autoIndex: false,
  }
);

module.exports =
  mongoose.models.KeheInventory || mongoose.model('KeheInventory', inventorySchema);
