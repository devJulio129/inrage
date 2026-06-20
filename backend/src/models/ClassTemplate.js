import mongoose from 'mongoose';

// Una franja recurrente del horario semanal del box: "los lunes a las 18:00
// hay CrossFit con 12 lugares". El horario es estático (se repite cada semana);
// las clases concretas y reservables se materializan a partir de estas franjas
// para los próximos días (ver services/classSchedule.js).
const classTemplateSchema = new mongoose.Schema(
  {
    // 0 = domingo … 6 = sábado (convención de Date.getUTCDay), en hora del gym.
    weekday: { type: Number, required: true, min: 0, max: 6, index: true },
    time: { type: String, required: true, trim: true }, // "18:00"
    name: { type: String, default: 'CrossFit', trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 1000 },
    capacity: { type: Number, required: true, min: 1, max: 100 },
    active: { type: Boolean, default: true },
    // Hasta qué día (UTC, medianoche) ya se generaron clases para esta franja.
    // Evita regenerar un día que el coach canceló a mano y deja entrar los días
    // nuevos conforme avanza la ventana.
    generatedThrough: { type: Date, default: null }
  },
  { timestamps: true }
);

export const ClassTemplate = mongoose.model('ClassTemplate', classTemplateSchema);
