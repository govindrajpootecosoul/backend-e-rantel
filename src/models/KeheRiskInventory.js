const mongoose = require('mongoose');

const riskSchema = new mongoose.Schema(
  {
    fileMonth: { type: String, default: '' },
    retailer: { type: String, default: '' },
    retailerArea: { type: String, default: '' },
    sku: { type: String, default: '' },
    upc: { type: String, default: '' },
    productDescription: { type: String, default: '' },
    riskLevel: { type: String, default: '' },
    daysOfSupply: { type: Number, default: null },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
    importBatchId: { type: String, default: '' },
    sourceFileName: { type: String, default: '' },
  },
  {
    collection: 'kehe_risk_inventory',
    timestamps: true,
    autoIndex: false,
  }
);

module.exports =
  mongoose.models.KeheRiskInventory || mongoose.model('KeheRiskInventory', riskSchema);
