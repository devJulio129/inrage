import 'dotenv/config';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

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
