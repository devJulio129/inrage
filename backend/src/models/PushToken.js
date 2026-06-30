import mongoose from 'mongoose';

const pushTokenSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true
    },
    token: { type: String, required: true, trim: true },
    platform: { type: String, enum: ['android', 'ios', 'web', 'unknown'], default: 'unknown' },
    deviceName: { type: String, trim: true, maxlength: 120, default: '' },
    enabled: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
    disabledAt: { type: Date },
    disabledReason: { type: String, trim: true, maxlength: 160, default: '' }
  },
  { timestamps: true }
);

pushTokenSchema.index({ member: 1, token: 1 }, { unique: true });
pushTokenSchema.index({ token: 1 }, { unique: true });

export const PushToken = mongoose.model('PushToken', pushTokenSchema);
