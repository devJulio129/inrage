import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { getGymInfo, updateGymInfo } from '../controllers/gymInfoControllers.js';

const router = Router();

router.get('/', protect, getGymInfo);
router.put('/', protect, adminOnly, updateGymInfo);

export default router;
