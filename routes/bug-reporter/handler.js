import { Router } from 'express';

const router = Router();

const CLICKUP_API      = 'https://api.clickup.com/api/v2';
const CLICKUP_KEY      = () => process.env.CLICKUP_API_KEY;
const CLICKUP_TEAM     = () => process.env.CLICKUP_TEAM_ID;
const CLICKUP_PARENT   = () => process.env.CLICKUP_PARENT_TASK_ID;
const CLICKUP_ASSIGNEE = () => {
  const raw = process.env.CLICKUP_ASSIGNEE_ID?.trim();
  return raw ? [Number(raw)] : [];
};

const SEVERITY_LABEL    = { blocking: '🚨 Bloquant', annoying: '⚠️ Gênant', minor: 'Mineur' };
const SEVERITY_PRIORITY = { blocking: 1, annoying: 2, minor: 3 };

function getFriendlySource(url) {
  try {
    const u = new URL(url || 'about:blank');
    if (u.protocol === 'chrome-extension:') {
      const match = u.pathname.match(/\/modules\/([^/]+)\//);
      if (match) return match[1].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      return 'Extension';
    }
    return u.hostname;
  } catch { return url || '—'; }
}

function buildDescription({ message, url, pageTitle, userEmail, userName, extensionVersion, userAgent, screenResolution, timestamp, dateFormatted, tokenAgeMins, userPermissions, consoleLogs, fetchErrors, actionTrail, severity, devicePixelRatio, windowWidth, windowHeight, language }) {
  const tokenLine = tokenAgeMins == null
    ? '- **Token :** inconnu'
    : tokenAgeMins > 55
      ? `- **Token :** ⚠️ EXPIRÉ (${tokenAgeMins} min)`
      : `- **Token :** ✓ frais (${tokenAgeMins} min)`;

  const permsLine = userPermissions
    ? '- **Modules :** ' + Object.entries(userPermissions).map(([k, v]) => `${v ? '✓' : '✗'} ${k}`).join(' · ')
    : '';

  const sevLine     = severity ? `- **Sévérité :** ${SEVERITY_LABEL[severity] || severity}` : '';
  const windowLine  = (windowWidth && windowHeight) ? `- **Fenêtre :** ${windowWidth} × ${windowHeight}${devicePixelRatio ? ` (×${devicePixelRatio})` : ''}` : '';
  const langLine    = language ? `- **Langue :** ${language}` : '';

  const trailBlock = actionTrail?.length
    ? `\n## 🕐 Dernières actions (${actionTrail.length})\n\`\`\`\n${actionTrail.map(e => `[${e.t}] ${e.icon} ${e.label}`).join('\n')}\n\`\`\``
    : '';

  const logsBlock = consoleLogs?.length
    ? `\n## ⚠️ Console errors/warnings (${consoleLogs.length})\n\`\`\`\n${consoleLogs.map(l => `[${l.t}] [${l.level}] ${l.msg}`).join('\n')}\n\`\`\``
    : '';

  const fetchBlock = fetchErrors?.length
    ? `\n## 🔴 Requêtes HTTP échouées\n\`\`\`\n${fetchErrors.map(e => `[${e.t}] ${e.url} → ${e.status || e.error}`).join('\n')}\n\`\`\``
    : '';

  const lines = [
    message ? `## 💬 Description\n${message}\n` : '',
    `## 🌐 Contexte`,
    `- **Signalé par :** ${userName || '—'} (${userEmail || '—'})`,
    `- **Date :** ${dateFormatted || timestamp || new Date().toISOString()}`,
    `- **Version extension :** v${extensionVersion || '—'}`,
    `- **URL :** ${url || '—'}`,
    pageTitle ? `- **Page :** ${pageTitle}` : '',
    `- **Résolution :** ${screenResolution || '—'}`,
    windowLine,
    langLine,
    tokenLine,
    permsLine,
    sevLine,
    `\n## 🖥️ Navigateur\n\`\`\`\n${userAgent || '—'}\n\`\`\``,
    trailBlock,
    logsBlock,
    fetchBlock,
  ];
  return lines.filter(Boolean).join('\n');
}

// POST /webhook/bug-reporter
router.post('/', async (req, res) => {
  const { screenshot, message, url, pageTitle, userEmail, userName, extensionVersion, userAgent, screenResolution, timestamp, tokenAgeMins, userPermissions, consoleLogs, fetchErrors, actionTrail, severity, devicePixelRatio, windowWidth, windowHeight, language } = req.body ?? {};

  if (!screenshot) return res.status(400).json({ error: 'screenshot requis' });

  const apiKey   = CLICKUP_KEY();
  const teamId   = CLICKUP_TEAM();
  const parentId = CLICKUP_PARENT();
  if (!apiKey || !teamId || !parentId) {
    console.error('[bug-reporter] CLICKUP_API_KEY, CLICKUP_TEAM_ID ou CLICKUP_PARENT_TASK_ID manquant');
    return res.status(500).json({ error: 'Configuration ClickUp manquante' });
  }

  const dateFormatted = new Date(timestamp || Date.now()).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const taskSource    = getFriendlySource(url);
  const taskName      = `[Bug] ${taskSource} — ${dateFormatted}`;
  const description   = buildDescription({ message, url, pageTitle, userEmail, userName, extensionVersion, userAgent, screenResolution, timestamp, dateFormatted, tokenAgeMins, userPermissions, consoleLogs, fetchErrors, actionTrail, severity, devicePixelRatio, windowWidth, windowHeight, language });

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
    const assignees = CLICKUP_ASSIGNEE();
    console.log('[bug-reporter] assignees:', assignees);
    const taskRes = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: taskName, markdown_description: description, parent: parent.id, priority: SEVERITY_PRIORITY[severity] ?? 3, assignees, status: 'A FAIRE', custom_type: 'Bug' }),
    });
    if (!taskRes.ok) {
      const err = await taskRes.text();
      console.error('[bug-reporter] ClickUp create task error:', err);
      return res.status(502).json({ error: 'Erreur création tâche ClickUp' });
    }
    const task = await taskRes.json();

    // 3. Assigner explicitement via PUT /task (assignees dans la création ignorés pour les sous-tâches)
    if (assignees.length) {
      const assignRes = await fetch(`${CLICKUP_API}/task/${task.id}`, {
        method: 'PUT',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignees: { add: assignees, rem: [] } }),
      });
      const assignBody = await assignRes.text();
      console.log(`[bug-reporter] Assignee PUT → ${assignRes.status}: ${assignBody}`);
    }

    // 4. Attacher le screenshot annoté
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
