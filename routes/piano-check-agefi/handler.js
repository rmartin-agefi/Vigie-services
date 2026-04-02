import { Router } from 'express';
import { checkPianoAccess } from '../../lib/piano.js';

const router = Router();

// GET /webhook/piano-check-agefi?email=...
router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email requis' });

  const aid      = process.env.PIANO_APP_ID_AGEFI;
  const apiToken = process.env.PIANO_API_KEY_AGEFI;
  if (!aid || !apiToken) {
    return res.status(500).json({ error: 'PIANO_APP_ID_AGEFI ou PIANO_API_KEY_AGEFI non configuré' });
  }

  try {
    const result = await checkPianoAccess(email, aid, apiToken, 'agefi');
    return res.json(result);
  } catch (err) {
    console.error('[piano-check-agefi] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
