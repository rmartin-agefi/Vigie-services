import { Router } from 'express';
import { getPrompt } from '../../lib/gcs.js';
import { callChat } from '../../lib/openai.js';

const router = Router();

// POST /webhook/check-position
// Body: { liExperience, sfTitle, sfCompany, sfFn1, sfFn2 }
// Retourne: { status: "up_to_date"|"sf_outdated"|"different", message: "..." }
router.post('/', async (req, res) => {
  const { liExperience, sfTitle, sfCompany, sfFn1, sfFn2 } = req.body ?? {};

  if (!liExperience) {
    return res.status(400).json({ error: 'liExperience requis' });
  }

  const promptTemplate = await getPrompt('check-position');
  if (!promptTemplate) {
    return res.status(500).json({ error: 'Prompt introuvable (GCS)' });
  }

  // Substitution des variables du template
  const prompt = promptTemplate
    .replace('{{liExperience}}', liExperience)
    .replace('{{sfTitle}}',      sfTitle      ?? '')
    .replace('{{sfCompany}}',    sfCompany    ?? '')
    .replace('{{sfFn1}}',        sfFn1        ?? '')
    .replace('{{sfFn2}}',        sfFn2        ?? '');

  try {
    const text = await callChat(prompt, { model: 'gpt-4.1-mini', temperature: 0 });

    // Nettoyer les balises markdown éventuelles (```json ... ```)
    const cleaned = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    const data = JSON.parse(cleaned);
    return res.json(data);
  } catch (err) {
    console.error('[check-position] Erreur:', err.message);
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'Réponse OpenAI invalide (non-JSON)' });
    }
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
