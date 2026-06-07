import mongoose from 'mongoose';

const loginLogSchema = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  name:  { type: String },
  email: { type: String },
  role:  { type: String },
  ip:    { type: String },
  // 'login' = inicio de sesión normal; 'register' = creó su cuenta;
  // 'google' = entró con Google.
  event: { type: String, enum: ['login', 'register', 'google'], default: 'login' },
  at:    { type: Date, default: Date.now },
});

export const LoginLog = mongoose.model('LoginLog', loginLogSchema);
