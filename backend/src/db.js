const mongoose = require('mongoose');
const config = require('./config');

let bucket = null;

async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { autoIndex: true });
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'media' });
  console.log('[db] MongoDB connecté');
}

function getBucket() {
  if (!bucket) throw new Error('GridFS non initialisé');
  return bucket;
}

module.exports = { connectDb, getBucket };
