import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'membership_expiring_7_days',
  'membership_expiring_1_day',
  'membership_expired',
  'admin_manual_reminder',
  'payment_confirmed'
];

const notificationSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true
    },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ['unread', 'read'], default: 'unread', index: true },
    sentAt: { type: Date, default: Date.now },
    readAt: { type: Date },
    reminderKey: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

notificationSchema.index({ member: 1, createdAt: -1 });
notificationSchema.index(
  { reminderKey: 1 },
  { unique: true, sparse: true }
);

export const Notification = mongoose.model('Notification', notificationSchema);
