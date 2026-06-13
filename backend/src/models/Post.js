import mongoose from 'mongoose';

// Publicaciones del gimnasio: educación deportiva, avisos largos, videos.
// La imagen viaja como data-URI pequeña; los videos son links (YouTube, etc).
const postSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 3000 },
    image: { type: String },
    videoUrl: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' }
  },
  { timestamps: true }
);

export const Post = mongoose.model('Post', postSchema);
