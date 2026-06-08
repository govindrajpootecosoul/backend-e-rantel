const KeheInventory = require('../models/KeheInventory');
const KeheChainStore = require('../models/KeheChainStore');
const { createInventoryService } = require('./store-inventory-core');

module.exports = createInventoryService(KeheInventory, KeheChainStore);
