import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import {
  getTodayWorkout,
  getRecentWorkouts,
  listWorkouts,
  upsertWorkout,
  updateWorkout,
  deleteWorkout,
  listComments,
  addComment,
  deleteComment
} from '../controllers/workoutControllers.js';

const router = Router();

// Any logged-in member can see today's WOD (mobile app).
router.get('/today', protect, getTodayWorkout);
router.get('/recent', protect, getRecentWorkouts);

// WOD comments (any approved member).
router.get('/:id/comments', protect, listComments);
router.post('/:id/comments', protect, addComment);
router.delete('/:id/comments/:commentId', protect, deleteComment);

// Admin-only management.
router.get('/', protect, adminOnly, listWorkouts);
router.post('/', protect, adminOnly, upsertWorkout);
router.put('/:id', protect, adminOnly, updateWorkout);
router.delete('/:id', protect, adminOnly, deleteWorkout);

export default router;
