import { Router } from 'express';

const router = Router();

const CLICKUP_API    = 'https://api.clickup.com/api/v2';
const CLICKUP_KEY    = () => process.env.CLICKUP_API_KEY;
const CLICKUP_TEAM   = () => process.env.CLICKUP_TEAM_ID;
const CLICKUP_PARENT = () => process.env.CLICKUP_PARENT_TASK_ID;

function buildDescription({ message, url, pageTitle, userEmail, userName, extensionVersion, userAgent, screenResolution, timestamp }) {
  const lines = [
    message ? `## 💬 Description\n${message}\n` : '',
    `## 🌐 Contexte`,
    `- **Signalé par :** ${userName || '—'} (${userEmail || '—'})`,
    `- **Date :** ${timestamp || new Date().toISOString()}`,
    `- **Version extension :** v${extensionVersion || '—'}`,
    `- **URL :** ${url || '—'}`,
    pageTitle ? `- **Page :** ${pageTitle}` : '',
    `- **Résolution :** ${screenResolution || '—'}`,
    `\n## 🖥️ Navigateur\n\`\`\`\n${userAgent || '—'}\n\`\`\``,
  ];
  return lines.filter(Boolean).join('\n');
}

// POST /webhook/bug-reporter
router.post('/', async (req, res) => {
  const { screenshot, message, url, pageTitle, userEmail, userName, extensionVersion, userAgent, screenResolution, timestamp } = req.body ?? {};

  if (!screenshot) return res.status(400).json({ error: 'screenshot requis' });

  const apiKey   = CLICKUP_KEY();
  const teamId   = CLICKUP_TEAM();
  const parentId = CLICKUP_PARENT();
  if (!apiKey || !teamId || !parentId) {
    console.error('[bug-reporter] CLICKUP_API_KEY, CLICKUP_TEAM_ID ou CLICKUP_PARENT_TASK_ID manquant');
    return res.status(500).json({ error: 'Configuration ClickUp manquante' });
  }

  const taskName    = `[Bug] ${new URL(url || 'about:blank').hostname || url} — ${new Date(timestamp || Date.now()).toLocaleString('fr-FR')}`;
  const description = buildDescription({ message, url, pageTitle, userEmail, userName, extensionVersion, userAgent, screenResolution, timestamp });

  try {
    // 1. Récupérer la liste parente (nécessaire pour créer une sous-tâche)
    const parentRes = await fetch(
      `${CLICKUP_API}/task/${parentId}?custom_task_ids=true&team_id=${teamId}`,
      { headers: { Authorization: apiKey } }
    );
    if (!parentRes.ok) {
      const err = await parentRes.text();
      console.error('[bug-reporter] ClickUp get parent error:', err);
      return res.status(502).json({ error: 'Tâche parente ClickUp introuvable' });
    }
    const parent = await parentRes.json();
    const listId = parent.list?.id;
    if (!listId) return res.status(502).json({ error: 'List ID introuvable sur la tâche parente' });

    // 2. Créer la sous-tâche
    const taskRes = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: taskName, description, parent: parent.id }),
    });
    if (!taskRes.ok) {
      const err = await taskRes.text();
      console.error('[bug-reporter] ClickUp create task error:', err);
      return res.status(502).json({ error: 'Erreur création tâche ClickUp' });
    }
    const task = await taskRes.json();

    // 2. Attacher le screenshot annoté
    const base64 = screenshot.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const formData = new FormData();
    formData.append('attachment', new Blob([buffer], { type: 'image/png' }), `bug-${Date.now()}.png`);

    fetch(`${CLICKUP_API}/task/${task.id}/attachment`, {
      method: 'POST',
      headers: { Authorization: apiKey },
      body: formData,
    }).catch(e => console.error('[bug-reporter] Attachment error:', e.message));

    console.log(`[bug-reporter] Tâche créée : ${task.id} — ${taskName}`);
    return res.json({ success: true, taskId: task.id, taskUrl: task.url });
  } catch (err) {
    console.error('[bug-reporter] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
