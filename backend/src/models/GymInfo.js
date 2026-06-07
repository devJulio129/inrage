import mongoose from 'mongoose';

// Single document the admin edits; the mobile app reads it.
const gymInfoSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'InRage CrossFit' },
    // "Aviso / recomendación del día" — destacado en la app móvil.
    announcement: { type: String, default: '' },
    schedule: {
      type: [{ day: String, hours: String }],
      default: [
        { day: 'Lunes – Viernes', hours: '06:00 – 22:00' },
        { day: 'Sábado', hours: '08:00 – 14:00' },
        { day: 'Domingo', hours: 'Cerrado' }
      ]
    },
    address: { type: String, default: 'Av. Principal 123, Centro' },
    phone: { type: String, default: '833 000 0000' },
    instagram: { type: String, default: '@inrage.crossfit' }
  },
  { timestamps: true }
);

export const GymInfo = mongoose.model('GymInfo', gymInfoSchema);
