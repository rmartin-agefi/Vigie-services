import { Storage } from '@google-cloud/storage';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'prompts-ext';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const IS_DEV = process.env.AUTH_REQUIRED === 'false';

// Chemins GCS par clé logique
const PROMPT_KEY_MAP = {
  'entity-highlighter': 'Extensions/Vigie/Entity-highlighter/prompts/entity-highlighter.txt',
  'alpha-reader':        'Extensions/Vigie/PDF-highlighter/prompt/entity-highlighter.txt',
  'check-position':      'Extensions/Vigie/Linkedin-enrich/prompt/check-position.txt',
  'linkedin-summary':    'Extensions/Vigie/Linkedin-enrich/prompt/linkedin-summary.txt',
};

// Fichiers locaux (dev) : prompts/<key>.txt
// Pour alpha-reader, on réutilise entity-highlighter.txt en local
const LOCAL_KEY_MAP = {
  'alpha-reader': 'entity-highlighter',
};

// Cache en mémoire : { [cacheKey]: { value, expiresAt } }
const _cache = {};

async function _fetchGcs(gcsPath) {
  const [content] = await storage.bucket(BUCKET).file(gcsPath).download();
  return content.toString('utf8');
}

async function _fetchLocal(key) {
  const localKey = LOCAL_KEY_MAP[key] ?? key;
  const localPath = join(ROOT, 'prompts', `${localKey}.txt`);
  if (existsSync(localPath)) return readFile(localPath, 'utf8');
  throw new Error(`Fichier local introuvable : prompts/${localKey}.txt`);
}

/**
 * Retourne le contenu d'un prompt.
 * En dev : lit depuis prompts/<key>.txt (filesystem local)
 * En prod : lit depuis GCS via PROMPT_KEY_MAP
 * Retourne null si introuvable — les routes doivent retourner 500 dans ce cas.
 */
export async function getPrompt(key) {
  const cacheKey = `prompt:${key}`;
  const cached = _cache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const value = IS_DEV
      ? await _fetchLocal(key)
      : await _fetchGcs(PROMPT_KEY_MAP[key] ?? `Extensions/Vigie/${key}.txt`);

    _cache[cacheKey] = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    const path = IS_DEV ? `prompts/${LOCAL_KEY_MAP[key] ?? key}.txt` : PROMPT_KEY_MAP[key];
    console.warn(`[gcs] Prompt introuvable : ${path}`);
    return null;
  }
}

/**
 * Retourne un fichier JSON depuis GCS.
 * Chemin GCS : gs://<BUCKET>/Extensions/Vigie/data/<key>.json
 */
export async function getData(key) {
  const cacheKey = `data:${key}`;
  const cached = _cache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const raw = IS_DEV
      ? await readFile(join(ROOT, 'data', `${key}.json`), 'utf8')
      : (await _fetchGcs(`Extensions/Vigie/data/${key}.json`));

    const value = JSON.parse(raw);
    _cache[cacheKey] = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    console.warn(`[gcs] Data introuvable : ${key}.json`);
    return null;
  }
}

/** Vide tout le cache (appelé par POST /admin/refresh) */
export function refreshAll() {
  for (const key of Object.keys(_cache)) delete _cache[key];
  console.log('[gcs] Cache vidé');
}
