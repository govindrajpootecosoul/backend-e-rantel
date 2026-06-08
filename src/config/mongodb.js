const DEFAULT_DB_NAME = 'ecosoulhomepo';

const getMongoDbName = () => {
  const name = process.env.MONGODB_DB_NAME?.trim();
  return name || DEFAULT_DB_NAME;
};

const getMongoUri = () => {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment');
  }
  return uri;
};

const getMongoConnectOptions = () => ({
  dbName: getMongoDbName(),
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000,
});

module.exports = {
  getMongoDbName,
  getMongoUri,
  getMongoConnectOptions,
};
