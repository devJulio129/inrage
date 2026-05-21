import { Attendance } from '../models/Attendance.js'

export async function listAttendance(req, res, next){
    try{
        const attendance = await Attendance.find().populate('member');
        res.json(attendance);
    } catch(err) {
        next(err);
    }
};

export async function getAttendance(req, res, next){
    try{
        const attendance = await Attendance.findById(req.params.id);
        if(!attendance){
            return res.status(404).json({ error: 'Attendance not found'})
        }
        res.json(attendance);
    } catch(err){
        next(err);
    }
}

export async function createAttendance(req, res, next){
    try {
        const attendance = await Attendance.create(req.body);
        res.status(201).json(attendance)
    } catch(err){
        next(err);
    }
};
