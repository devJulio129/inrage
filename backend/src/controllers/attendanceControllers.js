import { Attendance } from '../models/Attendance.js';

export async function listAttendance(req, res, next) {
  try {
    // Admins see all; members see only their own
    const filter = req.user.role === 'admin' ? {} : { member: req.user._id };
    const attendance = await Attendance.find(filter).populate('member', '-password');
    res.json(attendance);
  } catch (err) {
    next(err);
  }
}

export async function getAttendance(req, res, next) {
  try {
    const attendance = await Attendance.findById(req.params.id).populate('member', '-password');
    if (!attendance) return res.status(404).json({ error: 'Attendance record not found' });

    // Members can only see their own records
    if (req.user.role !== 'admin' && attendance.member._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(attendance);
  } catch (err) {
    next(err);
  }
}

export async function createAttendance(req, res, next) {
  try {
    const attendance = await Attendance.create(req.body);
    res.status(201).json(attendance);
  } catch (err) {
    next(err);
  }
}

export async function updateAttendance(req, res, next) {
  try {
    const attendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('member', '-password');

    if (!attendance) return res.status(404).json({ error: 'Attendance record not found' });

    res.json(attendance);
  } catch (err) {
    next(err);
  }
}

export async function deleteAttendance(req, res, next) {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!attendance) return res.status(404).json({ error: 'Attendance record not found' });

    res.json({ message: 'Attendance record deleted' });
  } catch (err) {
    next(err);
  }
}
