const mongoose = require('mongoose');
const { getMongoDbName, getMongoUri, getMongoConnectOptions } = require('./mongodb');

const connectDB = async () => {
  mongoose.set('strictQuery', true);

  const dbName = getMongoDbName();
  await mongoose.connect(getMongoUri(), getMongoConnectOptions());

  console.log(`MongoDB connected (${dbName})`);
};

module.exports = connectDB;
