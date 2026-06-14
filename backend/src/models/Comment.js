import mongoose from 'mongoose';

// Comentario polimórfico: sirve para WODs y publicaciones.
// parentId != null → es una respuesta a otro comentario (un nivel de hilo).
const commentSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ['workout', 'post'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }
  },
  { timestamps: true }
);

commentSchema.index({ targetType: 1, targetId: 1, createdAt: 1 });

export const Comment = mongoose.model('Comment', commentSchema);
