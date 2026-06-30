import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { runDueNotificationJobs } from '../services/notificationJobs.js';

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('Missing MONGODB_URI');
  process.exit(1);
}

await mongoose.connect(uri);
try {
  const result = await runDueNotificationJobs();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await mongoose.disconnect();
}
