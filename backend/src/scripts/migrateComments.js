import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Comment } from '../models/Comment.js';

// Copia los comentarios de WOD viejos (colección wodcomments) a la colección
// unificada `comments`, preservando _id para que las reacciones que apuntan a
// cada comentario sigan funcionando. Idempotente: no duplica.
async function run() {
  await connectDB(process.env.MONGODB_URI);
  const legacy = mongoose.connection.collection('wodcomments');
  const docs = await legacy.find({}).toArray();
  let migrated = 0;
  for (const d of docs) {
    const exists = await Comment.findById(d._id).lean();
    if (exists) continue;
    await Comment.create({
      _id: d._id,
      targetType: 'workout',
      targetId: d.workout,
      member: d.member,
      text: d.text,
      parentId: null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt
    });
    migrated++;
  }
  console.log(`[migrate] WOD comments → comments: ${migrated} migrados, ${docs.length - migrated} ya existían`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrate] error:', err.message);
  process.exit(1);
});
