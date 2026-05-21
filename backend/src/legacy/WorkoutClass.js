import mongoose from 'mongoose';

const workoutClassSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    capacity: { type: Number, default: 12, min: 1 },
    coach: { type: String, trim: true }
  },
  { timestamps: true }
);

export const WorkoutClass = mongoose.model('WorkoutClass', workoutClassSchema);
