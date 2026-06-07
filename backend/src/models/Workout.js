import mongoose from 'mongoose';

const workoutSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' }
  },
  { timestamps: true }
);

export const Workout = mongoose.model('Workout', workoutSchema);
