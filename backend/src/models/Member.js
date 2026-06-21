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
    // IDs estables del proveedor social, para enlazar la cuenta aunque el
    // correo cambie o quede oculto (p. ej. el relay privado de Apple).
    appleId: { type: String, default: null, index: true, sparse: true },
    googleId: { type: String, default: null, index: true, sparse: true },
    // Rango del atleta, lo asigna el admin (tiempo entrenando + pesos). null =
    // sin rango todavía. Es motivacional, no afecta permisos.
    rank: {
      type: String,
      enum: ['rookie', 'intermedio', 'avanzado', 'elite', 'leyenda'],
      default: null
    },
    // Racha de asistencia (días consecutivos). Se mantiene al hacer check-in y
    // se pierde sola cuando dejan de ir; el admin también puede ajustarla.
    streak: { type: Number, default: 0, min: 0 },
    streakDay: { type: String, default: null }, // 'YYYY-MM-DD' del último día contado
    longestStreak: { type: Number, default: 0, min: 0 },
    avatar: { type: String, default: null },
  },
  { timestamps: true },
);

export const Member = mongoose.model("Member", memberSchema);
