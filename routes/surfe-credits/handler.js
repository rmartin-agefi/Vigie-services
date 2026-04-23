import { Router } from 'express';

const router = Router();
const SURFE_CREDITS_URL = 'https://api.surfe.com/v1/credits';

// GET /webhook/surfe-credits — retourne le solde de crédits sans consommer de token
router.get('/', async (req, res) => {
  const apiKey = process.env.SURFE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SURFE_API_KEY non configuré' });

  try {
    const r = await fetch(SURFE_CREDITS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) return res.status(502).json({ error: `Surfe API error: ${r.status}` });
    const data = await r.json();
    return res.json(data);
  } catch (err) {
    console.error('[surfe-credits]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
