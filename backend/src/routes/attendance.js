import { Router } from 'express'
import {
    listAttendance,
    getAttendance,
    createAttendance
} from '../controllers/attendanceControllers.js'

const attendanceRoutes = Router();

attendanceRoutes.get('/', listAttendance)
attendanceRoutes.get('/:id', getAttendance)
attendanceRoutes.post('/', createAttendance)

export default attendanceRoutes;