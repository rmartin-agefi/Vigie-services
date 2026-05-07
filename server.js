import express from 'express';
import cors from 'cors';
import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { authMiddleware } from './middleware/auth.js';
import { requirePermission } from './middleware/permissions.js';
import { refreshAll } from './lib/gcs.js';
import { refreshPermissionsCache } from './lib/firestore.js';
import sendInviteHandler from './routes/send-invite/handler.js';

// Route name → module permission required (null = auth only, no module check)
const ROUTE_PERMISSIONS = {
  'entity-highlighter':     ['eh', 'alpha'],  // partagé entre les deux modules
  'linkedin-summary':       'linkedin',
  'check-position':         'linkedin',
  'surfe-search':           'linkedin',
  'surfe-credits':          'linkedin',
  'salesforce-search':      'linkedin',
  'salesforce-search-link': 'linkedin',
  'piano-check-agefi':      'linkedin',
  'piano-check-opinion':    'linkedin',
  'sf-guard':               ['eh', 'alpha', 'linkedin'],
  'sf':                     ['eh', 'alpha', 'linkedin'],
  'refresh-cache':          null,
  'bug-reporter':           null,
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth sur toutes les routes /webhook/* (bypass si AUTH_REQUIRED=false)
app.use('/webhook', authMiddleware);

// Auto-load routes : chaque dossier dans routes/ → /webhook/<nom-dossier>
const ROUTES_DIR = join(__dirname, 'routes');
const routeDirs = await readdir(ROUTES_DIR);

for (const name of routeDirs) {
  const handlerPath = join(ROUTES_DIR, name, 'handler.js');
  if (!existsSync(handlerPath)) continue;

  const { default: handler } = await import(pathToFileURL(handlerPath).href);
  const moduleKey = ROUTE_PERMISSIONS[name];
  if (moduleKey !== undefined && moduleKey !== null) {
    const keys = Array.isArray(moduleKey) ? moduleKey : [moduleKey];
    app.use(`/webhook/${name}`, requirePermission(...keys), handler);
    console.log(`  ✓ /webhook/${name} [permission: ${keys.join(' | ')}]`);
  } else {
    app.use(`/webhook/${name}`, handler);
    console.log(`  ✓ /webhook/${name}`);
  }
}

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Middleware admin token partagé
function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Envoi d'un email d'invitation depuis l'admin (pas d'auth — risque faible)
app.use('/admin/send-invite', sendInviteHandler);

// Refresh cache GCS (appelé par sync-prompts.sh après upload)
app.post('/admin/refresh', adminAuth, (req, res) => {
  refreshAll();
  refreshPermissionsCache();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`influence-services listening on :${PORT}`);
});
