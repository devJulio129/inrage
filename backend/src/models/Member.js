import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["active", "expiring_soon", "expired", "frozen", "inactive"],
      default: "inactive",
    },
    planName: { type: String, trim: true, maxlength: 100 },
    startDate: { type: Date },
    endDate: { type: Date },
    lastPaymentAt: { type: Date },
    nextPaymentDueAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 1000 },
    reminder7DaysSentAt: { type: Date },
    reminder1DaySentAt: { type: Date },
    expiredReminderSentAt: { type: Date },
  },
  { _id: false },
);

const pushTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, trim: true },
    platform: { type: String, trim: true },
    deviceId: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const notificationPreferencesSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    posts: { type: Boolean, default: true },
    classReminders: { type: Boolean, default: true },
    classChanges: { type: Boolean, default: true },
    membership: { type: Boolean, default: true },
    branchPreference: {
      type: String,
      enum: ["all", "Torres", "Central"],
      default: "all",
    },
  },
  { _id: false },
);

const publicProfileSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    slug: { type: String, trim: true, lowercase: true },
    bio: { type: String, trim: true, maxlength: 300, default: "" },
    avatarUrl: { type: String, trim: true, default: "" },
    coverUrl: { type: String, trim: true, default: "" },
    showAttendanceStats: { type: Boolean, default: true },
    showPrs: { type: Boolean, default: true },
    showBadges: { type: Boolean, default: true },
    featuredPrs: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const passwordResetSchema = new mongoose.Schema(
  {
    tempPasswordHash: { type: String },
    tempPasswordExpiresAt: { type: Date },
    resetTokenHash: { type: String },
    resetTokenExpiresAt: { type: Date },
    mustChangePassword: { type: Boolean, default: false },
    usedAt: { type: Date },
    requestedAt: { type: Date },
  },
  { _id: false },
);

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
    membership: { type: membershipSchema, default: undefined },
    publicProfile: { type: publicProfileSchema, default: undefined },
    passwordReset: { type: passwordResetSchema, default: undefined },
    pushTokens: { type: [pushTokenSchema], default: [] },
    notificationPreferences: { type: notificationPreferencesSchema, default: () => ({}) },
  },
  { timestamps: true },
);

memberSchema.index(
  { "publicProfile.slug": 1 },
  { unique: true, sparse: true },
);

export const Member = mongoose.model("Member", memberSchema);
