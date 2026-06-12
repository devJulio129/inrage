import mongoose from 'mongoose';

const prSchema = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  movement: { type: String, required: true, trim: true },
  value: { type: Number, required: true },
  // 'time' = segundos (p. ej. récord de 400 m); el cliente lo muestra mm:ss.
  unit: { type: String, enum: ['kg', 'lb', 'reps', 'time'], default: 'kg' },
  setAt: { type: Date, default: Date.now },
});

// Un PR por movimiento por atleta.
prSchema.index({ member: 1, movement: 1 }, { unique: true });

export const PR = mongoose.model('PR', prSchema);
