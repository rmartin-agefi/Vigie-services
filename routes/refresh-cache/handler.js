import { Router } from 'express';
import { refreshAll } from '../../lib/gcs.js';
import { refreshPermissionsCache } from '../../lib/firestore.js';

const router = Router();

// POST /webhook/refresh-cache
// Protégé par auth Azure AD (middleware global)
// Vide le cache GCS (prompts) ET le cache Firestore (permissions)
router.post('/', (req, res) => {
  console.log(`[refresh-cache] Déclenché par ${req.user?.email ?? 'inconnu'}`);
  refreshAll();
  refreshPermissionsCache();
  res.json({ ok: true });
});

export default router;
