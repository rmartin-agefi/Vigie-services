import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'prompts-ext';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Chemins GCS par clé logique
const PROMPT_KEY_MAP = {
  'entity-highlighter': 'Extensions/Vigie/Entity-highlighter/prompts/entity-highlighter.txt',
  'alpha-reader':        'Extensions/Vigie/PDF-highlighter/prompt/entity-highlighter.txt',
  'check-position':      'Extensions/Vigie/Linkedin-enrich/prompt/check-position.txt',
  'linkedin-summary':    'Extensions/Vigie/Linkedin-enrich/prompt/linkedin-summary.txt',
};

// Cache en mémoire : { [cacheKey]: { value, expiresAt } }
const _cache = {};

async function _fetchGcs(gcsPath) {
  const [content] = await storage.bucket(BUCKET).file(gcsPath).download();
  return content.toString('utf8');
}

/**
 * Retourne le contenu d'un prompt depuis GCS.
 * Retourne null si introuvable — les routes doivent retourner 500 dans ce cas.
 */
export async function getPrompt(key) {
  const cacheKey = `prompt:${key}`;
  const cached = _cache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const value = await _fetchGcs(PROMPT_KEY_MAP[key] ?? `Extensions/Vigie/${key}.txt`);
    _cache[cacheKey] = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    console.warn(`[gcs] Prompt introuvable : ${PROMPT_KEY_MAP[key]}`);
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
    const raw = await _fetchGcs(`Extensions/Vigie/data/${key}.json`);
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
