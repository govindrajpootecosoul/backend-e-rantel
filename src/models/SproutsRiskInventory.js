const mongoose = require('mongoose');

const riskSchema = new mongoose.Schema(
  {
    esn: { type: String, default: '' },
    supplier: { type: String, default: '' },
    dc: { type: String, default: '' },
    broker: { type: String, default: '' },
    upc: { type: String, default: '' },
    brand: { type: String, default: '' },
    itemDescription: { type: String, default: '' },
    reason: { type: String, default: '' },
    note: { type: String, default: '' },
    pack: { type: Number, default: null },
    size: { type: String, default: '' },
    uom: { type: String, default: '' },
    guaranteedShelfLifeDaysToCustomer: { type: Number, default: null },
    sellByDate: { type: String, default: '' },
    daysRemainingToShipToCustomer: { type: Number, default: null },
    unitSalesVelocityPerDay: { type: Number, default: null },
    unitsOnHandWithNoForecastDemand: { type: Number, default: null },
    downloadedOn: { type: String, default: '' },
    reportMonth: { type: String, default: '' },
    sku: { type: String, default: '' },
    boxPerCase: { type: Number, default: null },
    material: { type: String, default: '' },
    productCategory: { type: String, default: '' },
    productSubCategory: { type: String, default: '' },
    productType: { type: String, default: '' },
    importBatchId: { type: String, default: '' },
    sourceFileName: { type: String, default: '' },
  },
  {
    collection: 'sprouts_risk_inventory',
    timestamps: true,
    autoIndex: false,
  }
);

module.exports =
  mongoose.models.SproutsRiskInventory || mongoose.model('SproutsRiskInventory', riskSchema);
