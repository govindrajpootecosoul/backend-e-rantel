const SproutsInventory = require('../models/SproutsInventory');
const SproutsChainStore = require('../models/SproutsChainStore');
const { createInventoryService } = require('./store-inventory-core');

module.exports = createInventoryService(SproutsInventory, SproutsChainStore);
