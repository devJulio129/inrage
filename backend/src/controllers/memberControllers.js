import bcrypt from 'bcryptjs';
import { Member } from '../models/Member.js';

export async function listMembers(req, res, next) {
  try {
    const members = await Member.find().select('-password');
    res.json(members);
  } catch (err) {
    next(err);
  }
}

export async function getMember(req, res, next) {
  try {
    // Members can only see their own profile; admins can see anyone
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const member = await Member.findById(req.params.id).select('-password');
    if (!member) return res.status(404).json({ error: 'Member not found' });

    res.json(member);
  } catch (err) {
    next(err);
  }
}

export async function createMember(req, res, next) {
  try {
    const { password, ...rest } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const member = await Member.create({ ...rest, password: hashedPassword });

    const { password: _, ...memberObj } = member.toObject();
    res.status(201).json(memberObj);
  } catch (err) {
    next(err);
  }
}

export async function updateMember(req, res, next) {
  try {
    // Members can only update their own profile; admins can update anyone
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Prevent non-admins from changing their role
    if (req.user.role !== 'admin') delete req.body.role;

    // If password is being updated, hash it
    if (req.body.password) {
      req.body.password = await bcrypt.hash(req.body.password, 10);
    }

    const member = await Member.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-password');

    if (!member) return res.status(404).json({ error: 'Member not found' });

    res.json(member);
  } catch (err) {
    next(err);
  }
}

export async function deleteMember(req, res, next) {
  try {
    const member = await Member.findByIdAndDelete(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    res.json({ message: 'Member deleted' });
  } catch (err) {
    next(err);
  }
}
