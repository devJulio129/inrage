import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import {
  checkIn,
  checkOut,
  myAttendance,
  activeNow
} from '../controllers/attendanceControllers.js';
import { checkInErrorResponse, checkInWithRotatingQr } from '../services/checkinQr.js';

const attendanceRoutes = Router();

// Athlete presence
attendanceRoutes.post('/checkin',  protect, checkIn);
attendanceRoutes.post('/checkout', protect, checkOut);
attendanceRoutes.get('/me',        protect, myAttendance);
attendanceRoutes.post('/check-in/qr', protect, async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ status: 'invalid_qr', error: 'Falta token de QR' });
    const result = await checkInWithRotatingQr(req.user._id, token, {
      confirmAutoReserve: Boolean(req.body?.confirmAutoReserve)
    });
    res.json(result);
  } catch (err) {
    if (err?.code) {
      return res.status(err.status || 400).json(checkInErrorResponse(err));
    }
    next(err);
  }
});

// Admin: who is in the box right now
attendanceRoutes.get('/active',    protect, adminOnly, activeNow);

export default attendanceRoutes;
