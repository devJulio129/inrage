import mongoose from 'mongoose';

const gymClassSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true }, // día (normalizado a 00:00)
    time: { type: String, required: true, trim: true }, // "18:00" — como en el pizarrón
    name: { type: String, default: 'CrossFit', trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 1000 }, // de qué trata la clase
    capacity: { type: Number, required: true, min: 1, max: 100 },
    reservations: [
      {
        member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
        at: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

export const GymClass = mongoose.model('GymClass', gymClassSchema);
