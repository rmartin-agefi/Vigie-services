/**
 * Lecture des permissions utilisateur depuis Firestore (REST public).
 * Les règles Firestore autorisent read: if true — pas besoin d'auth.
 * Cache 5 min en mémoire pour éviter un appel réseau à chaque requête.
 */

const PROJECT_ID  = process.env.FIREBASE_PROJECT_ID || 'influence-beymedias';
const API_KEY     = process.env.FIREBASE_API_KEY    || 'AIzaSyDu00l36bLr_WxLvP4l9zMCnvLpY3GNwqE';
const BASE_URL    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutes

const _cache = new Map(); // email → { permissions, exp }

function _parseDoc(doc) {
  const f = doc?.fields || {};
  const rawLimit = f.surfeLimit?.integerValue ?? f.surfeLimit?.doubleValue;
  return {
    eh:         f.eh?.booleanValue       ?? false,
    linkedin:   f.linkedin?.booleanValue ?? false,
    alpha:      f.alpha?.booleanValue    ?? false,
    llm:        f.llm?.booleanValue      ?? false,

    surfeLimit: rawLimit !== undefined ? Number(rawLimit) : 0,
  };
}

/**
 * Retourne les permissions d'un utilisateur.
 * Retourne tout à false si l'utilisateur n'existe pas dans Firestore.
 * Lance une erreur si Firestore est injoignable.
 */
export async function getUserPermissions(email) {
  const cached = _cache.get(email);
  if (cached && Date.now() < cached.exp) return cached.permissions;

  const url = `${BASE_URL}/users/${encodeURIComponent(email)}?key=${API_KEY}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });

  let permissions;
  if (resp.status === 404) {
    permissions = { eh: false, linkedin: false, alpha: false, llm: false };
  } else if (!resp.ok) {
    throw new Error(`Firestore GET ${resp.status}`);
  } else {
    permissions = _parseDoc(await resp.json());
  }

  _cache.set(email, { permissions, exp: Date.now() + CACHE_TTL });
  return permissions;
}

/** Vide le cache (cohérence avec refreshAll GCS) */
export function refreshPermissionsCache() {
  _cache.clear();
  console.log('[firestore] Cache permissions vidé');
}
