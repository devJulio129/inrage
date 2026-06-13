import 'dotenv/config';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

// Sin secreto no hay tokens válidos: mejor no arrancar que firmar con undefined.
if (!process.env.JWT_SECRET) {
  console.error('[server] JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = createApp();
const PORT = process.env.PORT || 4000;

connectDB(process.env.MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] failed to start:', err.message);
    process.exit(1);
  });
