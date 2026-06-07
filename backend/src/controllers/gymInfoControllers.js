import { GymInfo } from '../models/GymInfo.js';

// Returns the singleton gym-info doc, creating it with defaults the first time.
async function getOrCreate() {
  let info = await GymInfo.findOne();
  if (!info) info = await GymInfo.create({});
  return info;
}

// GET /api/gym-info  (any authenticated member)
export async function getGymInfo(req, res, next) {
  try {
    res.json(await getOrCreate());
  } catch (err) {
    next(err);
  }
}

// PUT /api/gym-info  (admin) — update the gym info / daily announcement.
export async function updateGymInfo(req, res, next) {
  try {
    const info = await getOrCreate();
    const fields = ['name', 'announcement', 'schedule', 'address', 'phone', 'instagram'];
    for (const f of fields) {
      if (req.body[f] !== undefined) info[f] = req.body[f];
    }
    await info.save();
    res.json(info);
  } catch (err) {
    next(err);
  }
}
