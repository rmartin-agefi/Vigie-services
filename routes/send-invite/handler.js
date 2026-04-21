import { Router } from 'express';
import { getEmailTemplate } from '../../lib/gcs.js';

const VALID_TEMPLATES = ['journaliste', 'complet'];

const router = Router();

router.post('/', async (req, res) => {
  const { email, template } = req.body ?? {};

  if (!email || !VALID_TEMPLATES.includes(template)) {
    return res.status(400).json({ error: 'email et template requis (journaliste | complet)' });
  }

  const html = await getEmailTemplate(template);
  if (!html) return res.status(500).json({ error: 'Template introuvable dans GCS' });

  const webhookUrl = process.env.N8N_INVITE_WEBHOOK_URL;
  if (!webhookUrl) return res.status(500).json({ error: 'N8N_INVITE_WEBHOOK_URL non configuré' });

  const n8nRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: email, html }),
  });

  if (!n8nRes.ok) {
    const detail = await n8nRes.text().catch(() => '');
    return res.status(502).json({ error: 'Erreur n8n', detail });
  }

  res.json({ ok: true });
});

export default router;
