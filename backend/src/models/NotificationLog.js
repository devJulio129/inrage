import mongoose from 'mongoose';

const notificationLogSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', index: true },
    branch: { type: String, trim: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['sent', 'skipped', 'failed'],
      default: 'sent',
      index: true
    },
    error: { type: String, trim: true, maxlength: 500 },
    sentAt: { type: Date, default: Date.now, index: true },
    classId: { type: String, trim: true },
    postId: { type: String, trim: true },
    reminderKey: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

notificationLogSchema.index({ member: 1, sentAt: -1 });
notificationLogSchema.index({ reminderKey: 1 }, { unique: true, sparse: true });

export const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);
