import mongoose from 'mongoose';

const wodCommentSchema = new mongoose.Schema(
  {
    workout: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout', required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    text: { type: String, required: true, trim: true, maxlength: 500 }
  },
  { timestamps: true }
);

export const WodComment = mongoose.model('WodComment', wodCommentSchema);
