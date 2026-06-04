import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import {
  checkIn,
  checkOut,
  myAttendance,
  activeNow
} from '../controllers/attendanceControllers.js';

const attendanceRoutes = Router();

// Athlete presence
attendanceRoutes.post('/checkin',  protect, checkIn);
attendanceRoutes.post('/checkout', protect, checkOut);
attendanceRoutes.get('/me',        protect, myAttendance);

// Admin: who is in the box right now
attendanceRoutes.get('/active',    protect, adminOnly, activeNow);

export default attendanceRoutes;
