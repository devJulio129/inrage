import bcrypt from 'bcryptjs';
import { Member } from '../models/Member.js';
import { LoginLog } from '../models/LoginLog.js';
import { gymTodayStr, effectiveStreak } from '../services/gymTime.js';

export async function listMembers(req, res, next) {
  try {
    const members = await Member.find().select('-password -avatar').lean();

    // Attach each member's most recent login so the admin UI can show a
    // traffic-light status (active / idle / never logged in).
    const lastLogins = await LoginLog.aggregate([
      { $group: { _id: '$member', lastLogin: { $max: '$at' } } }
    ]);
    const lastById = new Map(
      lastLogins.map((l) => [String(l._id), l.lastLogin])
    );

    const today = gymTodayStr();
    const withStatus = members.map((m) => ({
      ...m,
      // Racha "viva" (0 si dejaron de ir), para que el admin la vea al día.
      streak: effectiveStreak(m, today),
      lastLogin: lastById.get(String(m._id)) || null
    }));

    res.json(withStatus);
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
    const { password, joinedAt, ...rest } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    // Admin-created members are active (approved) by default.
    const member = await Member.create({
      status: 'active',
      ...rest,
      password: hashedPassword,
      joinedAt: joinedAt ? new Date(joinedAt) : new Date()
    });

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

    // Prevent non-admins from changing their role, approval status, rank or streak
    if (req.user.role !== 'admin') {
      delete req.body.role;
      delete req.body.status;
      delete req.body.rank;
      delete req.body.streak;
      delete req.body.streakDay;
      delete req.body.longestStreak;
    }

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

// PATCH /api/members/:id/streak  (admin) — ver/ajustar la racha a mano.
// Fija el valor y marca "hoy" como último día contado, así sigue creciendo
// con los próximos check-ins y se pierde sola si dejan de ir.
export async function setMemberStreak(req, res, next) {
  try {
    const value = Math.max(0, Math.floor(Number(req.body.streak)));
    if (!Number.isFinite(value)) return res.status(400).json({ error: 'Racha inválida' });

    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    member.streak = value;
    member.streakDay = value > 0 ? gymTodayStr() : null;
    if (value > (member.longestStreak || 0)) member.longestStreak = value;
    await member.save();

    const obj = member.toObject();
    delete obj.password;
    res.json({ ...obj, streak: effectiveStreak(member) });
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
