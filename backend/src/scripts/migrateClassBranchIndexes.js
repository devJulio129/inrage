import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { GymClass } from '../models/GymClass.js';

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('Missing MONGODB_URI');
  process.exit(1);
}

await mongoose.connect(uri);

try {
  const indexes = await GymClass.collection.indexes();
  const legacy = indexes.find((index) =>
    index.unique === true &&
    JSON.stringify(index.key) === JSON.stringify({ date: 1, time: 1 })
  );

  if (legacy) {
    await GymClass.collection.dropIndex(legacy.name);
    console.log(`Dropped legacy unique index ${legacy.name}`);
  } else {
    console.log('No legacy {date,time} unique index found');
  }

  await GymClass.syncIndexes();
  console.log('GymClass indexes synced');
} finally {
  await mongoose.disconnect();
}
