import mongoose from 'mongoose';

// Mensajería directa gimnasio ↔ atleta. Cada mensaje pertenece al hilo de un
// `member` (el cliente). `fromAdmin` indica el lado que lo escribió.
// Los adjuntos viajan como data-URI (imágenes/PDF chicos) — hay topes de tamaño.
const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 200 },
    mime: { type: String, trim: true, maxlength: 100 },
    data: { type: String, required: true } // data:...;base64,...
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    fromAdmin: { type: Boolean, required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    body: { type: String, trim: true, maxlength: 2000, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    readByMember: { type: Boolean, default: false },
    readByAdmin: { type: Boolean, default: false }
  },
  { timestamps: true }
);

messageSchema.index({ member: 1, createdAt: 1 });

export const Message = mongoose.model('Message', messageSchema);
