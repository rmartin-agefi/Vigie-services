import { Router } from 'express';
import { refreshAll } from '../../lib/gcs.js';

const router = Router();

// POST /webhook/refresh-cache
// Protégé par auth Azure AD (middleware global)
// Vide le cache GCS en mémoire — forçe le rechargement des prompts au prochain appel
router.post('/', (_req, res) => {
  refreshAll();
  res.json({ ok: true });
});

export default router;
