import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import { Member } from '../models/Member.js';
import { Attendance } from '../models/Attendance.js';
import { Workout } from '../models/Workout.js';
import { LoginLog } from '../models/LoginLog.js';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function seed() {
  await connectDB(process.env.MONGODB_URI);

  await Promise.all([
    Member.deleteMany({}),
    Attendance.deleteMany({}),
    Workout.deleteMany({}),
    LoginLog.deleteMany({})
  ]);

  const adminPass = await bcrypt.hash('admin123', 10);
  const memberPass = await bcrypt.hash('member123', 10);

  const members = await Member.create([
    { name: 'Admin', email: 'admin@inrage.dev', password: adminPass, phone: '0000000000', birthDate: new Date('1990-01-01'), gender: 'prefer_not_to_say', role: 'admin', status: 'active', joinedAt: new Date('2025-01-10') },
    { name: 'Leonardo Test', email: 'leo@inrage.dev', password: memberPass, phone: '8332107763', birthDate: new Date('1990-05-05'), gender: 'male', status: 'active', joinedAt: new Date('2025-03-22') },
    { name: 'Sample Member', email: 'sample@inrage.dev', password: memberPass, phone: '8432107763', birthDate: new Date('2004-06-09'), gender: 'female', status: 'active', joinedAt: new Date('2026-05-28') },
    // Self-registered from the app, waiting for the admin to approve.
    { name: 'Pendiente Demo', email: 'pendiente@inrage.dev', password: memberPass, phone: '8112223344', birthDate: new Date('2001-02-15'), gender: 'male', status: 'pending', joinedAt: new Date() }
  ]);

  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  await Attendance.create([
    // Past visits (with checkout)
    { member: members[1]._id, checkIn: daysAgo(1), checkOut: new Date(daysAgo(1).getTime() + 3600000) },
    { member: members[1]._id, checkIn: daysAgo(2), checkOut: new Date(daysAgo(2).getTime() + 3600000) },
    { member: members[1]._id, checkIn: daysAgo(5), checkOut: new Date(daysAgo(5).getTime() + 3600000) },
    { member: members[2]._id, checkIn: daysAgo(10), checkOut: new Date(daysAgo(10).getTime() + 3600000) },
    // Open visit today → shows up live in "En el gym ahora"
    { member: members[1]._id, checkIn: new Date(Date.now() - 25 * 60 * 1000), checkOut: null }
  ]);

  // Login history → drives the admin traffic-light.
  // Leo logged in today (green). Sample logged in 12 days ago (yellow).
  // Admin has never logged in via the app yet (red) until they do.
  await LoginLog.create([
    { member: members[1]._id, name: members[1].name, email: members[1].email, role: members[1].role, ip: '187.190.10.4', at: daysAgo(0) },
    { member: members[1]._id, name: members[1].name, email: members[1].email, role: members[1].role, ip: '187.190.10.4', at: daysAgo(3) },
    { member: members[2]._id, name: members[2].name, email: members[2].email, role: members[2].role, ip: '201.144.5.9', at: daysAgo(12) }
  ]);

  // Today's WOD shown on the mobile app after login.
  await Workout.create({
    date: startOfDay(),
    title: 'FRAN',
    description: '21-15-9 reps for time:\n\n• Thrusters (43/30 kg)\n• Pull-ups\n\nScale as needed. Time cap: 10 min.',
    createdBy: members[0]._id
  });

  console.log('[seed] done');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
