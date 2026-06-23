import mongoose from 'mongoose';

const gymClassSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true }, // día (normalizado a 00:00)
    time: { type: String, required: true, trim: true }, // "18:00" — como en el pizarrón
    name: { type: String, default: 'CrossFit', trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 1000 }, // de qué trata la clase
    capacity: { type: Number, required: true, min: 1, max: 100 },
    // Si nació del horario semanal, apunta a la franja que la generó (null = clase suelta).
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassTemplate', default: null },
    reservations: [
      {
        member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
        // Legacy field kept for old reservations created before v1.3.0.
        at: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ['reserved', 'checked_in', 'cancelled', 'no_show', 'waitlist'],
          default: 'reserved'
        },
        reservedAt: { type: Date },
        cancelledAt: { type: Date },
        checkedInAt: { type: Date },
        checkInMethod: {
          type: String,
          enum: ['qr_scan', 'admin_manual']
        },
        checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
        notes: { type: String, trim: true, maxlength: 500 }
      }
    ]
  },
  { timestamps: true }
);

// Una sola clase por horario en un día dado: hace el upsert del materializador
// idempotente y evita duplicados si dos atletas abren la reserva a la vez.
gymClassSchema.index({ date: 1, time: 1 }, { unique: true });

export const GymClass = mongoose.model('GymClass', gymClassSchema);
