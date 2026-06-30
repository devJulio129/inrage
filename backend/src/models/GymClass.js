import mongoose from 'mongoose';
import { DEFAULT_BRANCH, BRANCHES } from '../services/branches.js';

const gymClassSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true }, // día (normalizado a 00:00)
    time: { type: String, required: true, trim: true }, // "18:00" — como en el pizarrón
    branch: { type: String, enum: BRANCHES, default: DEFAULT_BRANCH, index: true },
    name: { type: String, default: 'CrossFit', trim: true, maxlength: 60 },
    backgroundImage: { type: String, trim: true, maxlength: 2000, default: '' },
    description: { type: String, trim: true, maxlength: 1000 }, // de qué trata la clase
    capacity: { type: Number, required: true, min: 1, max: 100 },
    isSpecial: { type: Boolean, default: false, index: true },
    specialLabel: { type: String, trim: true, maxlength: 80, default: '' },
    specialDescription: { type: String, trim: true, maxlength: 1000, default: '' },
    featuredOnHome: { type: Boolean, default: false, index: true },
    homePriority: { type: Number, default: 0 },
    specialIcon: { type: String, trim: true, maxlength: 40, default: '' },
    specialColor: { type: String, trim: true, maxlength: 40, default: '' },
    visibleFrom: { type: Date },
    visibleUntil: { type: Date },
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
        source: {
          type: String,
          enum: ['athlete', 'admin', 'qr_auto'],
          default: 'athlete'
        },
        autoReservedByQr: { type: Boolean, default: false },
        notes: { type: String, trim: true, maxlength: 500 }
      }
    ]
  },
  { timestamps: true }
);

// Una sola clase por horario en un día dado: hace el upsert del materializador
// idempotente y evita duplicados si dos atletas abren la reserva a la vez.
gymClassSchema.index({ date: 1, time: 1, branch: 1 }, { unique: true });

export const GymClass = mongoose.model('GymClass', gymClassSchema);
