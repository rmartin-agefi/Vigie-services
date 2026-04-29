import { Router } from 'express';
import { getPrompt } from '../../lib/gcs.js';
import { callAI } from '../../lib/ai.js';

const router = Router();

// POST /webhook/linkedin-summary
// Body: { name, headline, about, experience }
// Retourne: { sector, current_position, expertises, summary, signal, highlights }
router.post('/', async (req, res) => {
  const { name, headline, about, experience } = req.body ?? {};

  if (!name && !experience) {
    return res.status(400).json({ error: 'name ou experience requis' });
  }

  const promptTemplate = await getPrompt('linkedin-summary');
  if (!promptTemplate) {
    return res.status(500).json({ error: 'Prompt introuvable (GCS)' });
  }

  const prompt = promptTemplate
    .replace('{{name}}',       name       ?? '')
    .replace('{{headline}}',   headline   ?? '')
    .replace('{{about}}',      about      ?? '')
    .replace('{{experience}}', experience ?? '');

  try {
    const text = await callAI('vigie.linkedin-summary', prompt, { temperature: 0.3 });
    const data = JSON.parse(text);
    return res.json(data);
  } catch (err) {
    console.error('[linkedin-summary] Erreur:', err.message);
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'Réponse OpenAI invalide (non-JSON)' });
    }
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
