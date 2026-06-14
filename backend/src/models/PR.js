import mongoose from 'mongoose';

const prSchema = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  movement: { type: String, required: true, trim: true },
  value: { type: Number, required: true },
  // Unidades soportadas:
  //  kg/lb      → cargas
  //  reps       → gimnasia / repeticiones
  //  time       → segundos (el cliente lo muestra mm:ss): distancias de cardio
  //  cal        → calorías en máquina (assault/echo/row/ski)
  //  cm         → altura de salto, medidas corporales
  //  bpm        → frecuencia cardíaca
  //  ml         → VO2máx (ml/kg/min)
  //  pct        → % de grasa corporal
  //  m          → metros (Cooper, lanzamiento)
  unit: {
    type: String,
    enum: ['kg', 'lb', 'reps', 'time', 'cal', 'cm', 'bpm', 'ml', 'pct', 'm'],
    default: 'kg'
  },
  setAt: { type: Date, default: Date.now },
});

// Un PR por movimiento por atleta.
prSchema.index({ member: 1, movement: 1 }, { unique: true });

export const PR = mongoose.model('PR', prSchema);
