require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri, getMongoConnectOptions } = require('../src/config/mongodb');

(async () => {
  await mongoose.connect(getMongoUri(), getMongoConnectOptions());
  const col = mongoose.connection.collection('purchase_orders_sps');
  const total = await col.countDocuments({});
  const [agg] = await col
    .aggregate([
      {
        $group: {
          _id: null,
          sumIfNull: { $sum: { $ifNull: ['$skuQty', 0] } },
          sumConvert: {
            $sum: { $convert: { input: '$skuQty', to: 'double', onError: 0, onNull: 0 } },
          },
          count: { $sum: 1 },
          uniquePo: {
            $addToSet: {
              $concat: [{ $toString: { $ifNull: ['$storeId', ''] } }, '|', { $toString: { $ifNull: ['$poNumber', ''] } }],
            },
          },
        },
      },
      { $project: { sumIfNull: 1, sumConvert: 1, count: 1, uniquePoCount: { $size: '$uniquePo' } } },
    ])
    .toArray();
  const types = await col.aggregate([{ $group: { _id: { $type: '$skuQty' }, n: { $sum: 1 } } }]).toArray();
  let jsSum = 0;
  const cursor = col.find({}, { projection: { skuQty: 1 } });
  for await (const d of cursor) {
    jsSum += Number(d.skuQty) || 0;
  }
  console.log(JSON.stringify({ total, agg, types, jsSum }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
