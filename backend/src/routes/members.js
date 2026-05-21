import { Router } from 'express';
import {
    listMembers,
    getMember,
    createMember
} from '../controllers/memberControllers.js'

const memberRoutes = Router();

memberRoutes.get('/', listMembers);
memberRoutes.get('/:id', getMember);
memberRoutes.post('/', createMember);

export default memberRoutes;