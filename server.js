import express from 'express';
import cors from 'cors';
import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { authMiddleware } from './middleware/auth.js';
import { refreshAll } from './lib/gcs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Auth sur toutes les routes /webhook/* (bypass si AUTH_REQUIRED=false)
app.use('/webhook', authMiddleware);

// Auto-load routes : chaque dossier dans routes/ → /webhook/<nom-dossier>
const ROUTES_DIR = join(__dirname, 'routes');
const routeDirs = await readdir(ROUTES_DIR);

for (const name of routeDirs) {
  const handlerPath = join(ROUTES_DIR, name, 'handler.js');
  if (!existsSync(handlerPath)) continue;

  const { default: handler } = await import(pathToFileURL(handlerPath).href);
  app.use(`/webhook/${name}`, handler);
  console.log(`  ✓ /webhook/${name}`);
}

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Refresh cache GCS (appelé par sync-prompts.sh après upload)
app.post('/admin/refresh', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  refreshAll();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`influence-services listening on :${PORT}`);
});
