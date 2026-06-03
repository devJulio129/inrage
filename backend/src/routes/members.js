import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import {
  listMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember
} from '../controllers/memberControllers.js';

const memberRoutes = Router();

memberRoutes.get('/',     protect, adminOnly, listMembers);
memberRoutes.get('/:id',  protect, getMember);
memberRoutes.post('/',    protect, adminOnly, createMember);
memberRoutes.put('/:id',  protect, updateMember);
memberRoutes.delete('/:id', protect, adminOnly, deleteMember);

export default memberRoutes;
