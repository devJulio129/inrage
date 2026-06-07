import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import {
  getTodayWorkout,
  listWorkouts,
  upsertWorkout,
  updateWorkout,
  deleteWorkout
} from '../controllers/workoutControllers.js';

const router = Router();

// Any logged-in member can see today's WOD (mobile app).
router.get('/today', protect, getTodayWorkout);

// Admin-only management.
router.get('/', protect, adminOnly, listWorkouts);
router.post('/', protect, adminOnly, upsertWorkout);
router.put('/:id', protect, adminOnly, updateWorkout);
router.delete('/:id', protect, adminOnly, deleteWorkout);

export default router;
