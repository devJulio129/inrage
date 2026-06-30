import { Router } from 'express';
import { whatsappSupportLink } from '../services/support.js';

const router = Router();

router.get('/whatsapp-link', (_req, res) => {
  res.json(whatsappSupportLink());
});

export default router;
