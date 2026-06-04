import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    joinedAt: { type: Date, default: Date.now },
    phone: { type: String, required: true },
    birthDate: { type: Date, required: true },
    password: { type: String, required: true},
    role: { type: String, enum:['athlete', 'admin'], default:'athlete'},
    // 'pending' = se registró solo desde la app y espera aprobación del admin.
    // 'active'  = aprobado: puede ver el WOD del día.
    status: { type: String, enum: ['pending', 'active'], default: 'pending' },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
    },
  },
  { timestamps: true },
);

export const Member = mongoose.model("Member", memberSchema);
