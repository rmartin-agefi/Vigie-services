import { Router } from 'express';
import { checkPianoAccess } from '../../lib/piano.js';

const router = Router();

// GET /webhook/piano-check-opinion?email=...
router.get('/', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email requis' });

  const aid      = process.env.PIANO_APP_ID_OPINION;
  const apiToken = process.env.PIANO_API_KEY_OPINION;
  if (!aid || !apiToken) {
    return res.status(500).json({ error: 'PIANO_APP_ID_OPINION ou PIANO_API_KEY_OPINION non configuré' });
  }

  try {
    const result = await checkPianoAccess(email, aid, apiToken, 'opinion');
    return res.json(result);
  } catch (err) {
    console.error('[piano-check-opinion] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
