import mongoose from 'mongoose';
import { BRANCHES, DEFAULT_BRANCH } from '../services/branches.js';

const branchCheckInQrSchema = new mongoose.Schema(
  {
    branch: { type: String, enum: BRANCHES, default: DEFAULT_BRANCH, unique: true, index: true },
    qrValue: { type: String, required: true },
    tokenHash: { type: String, required: true, index: true },
    tokenPreview: { type: String, default: '' },
    generation: { type: Number, default: 1 },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    generatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const BranchCheckInQr = mongoose.model('BranchCheckInQr', branchCheckInQrSchema);
