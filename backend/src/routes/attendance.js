import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import {
  listAttendance,
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance
} from '../controllers/attendanceControllers.js';

const attendanceRoutes = Router();

attendanceRoutes.get('/',     protect, listAttendance);
attendanceRoutes.get('/:id',  protect, getAttendance);
attendanceRoutes.post('/',    protect, adminOnly, createAttendance);
attendanceRoutes.put('/:id',  protect, adminOnly, updateAttendance);
attendanceRoutes.delete('/:id', protect, adminOnly, deleteAttendance);

export default attendanceRoutes;
