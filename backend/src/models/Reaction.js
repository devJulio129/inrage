import mongoose from 'mongoose';

// Reacción polimórfica: sirve para publicaciones, comentarios de WOD y WODs.
// Un atleta tiene a lo más UNA reacción por elemento (puede cambiarla).
export const REACTION_TYPES = ['power', 'goal', 'train', 'pain', 'tempt', 'rain', 'doubt'];
export const REACTION_TARGETS = ['post', 'comment', 'workout'];

const reactionSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: REACTION_TARGETS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    type: { type: String, enum: REACTION_TYPES, required: true }
  },
  { timestamps: true }
);

// Una reacción por (elemento, atleta); el índice también acelera el conteo.
reactionSchema.index({ targetType: 1, targetId: 1, member: 1 }, { unique: true });

export const Reaction = mongoose.model('Reaction', reactionSchema);
