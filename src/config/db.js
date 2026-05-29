const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    dbName: 'ecosoulpo',
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  console.log('MongoDB connected (ecosoulpo)');
};

module.exports = connectDB;
