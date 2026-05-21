import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Member } from '../models/Member.js';
import { Attendance } from '../models/Attendance.js';

async function seed() {
  await connectDB(process.env.MONGODB_URI);
  
   await Promise.all([
    Member.deleteMany({}),
    Attendance.deleteMany({})
   ]);
   

  const members = await Member.create([
    { name: 'Leonardo Test', email: 'leo@inrage.dev', phone: '8332107763', birthDate: new Date('1990-05-05'), gender: 'male' },
    { name: 'Sample Member', email: 'sample@inrage.dev', phone: '8432107763', birthDate: new Date('2004-06-09'), gender: 'female'  }
  ]);


  const daysAgo = (n) => new Date(Date.now() - n *24 * 60 * 60 * 1000)


await Attendance.create([
  { member: members[0]._id, checkIn: daysAgo(1) },
  { member: members[0]._id, checkIn: daysAgo(2) },
  { member: members[0]._id, checkIn: daysAgo(5) },
  { member: members[1]._id, checkIn: daysAgo(10) }
])

  console.log('[seed] done');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
