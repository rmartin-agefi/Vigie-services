/**
 * Quota journalier Surfe — lecture/écriture via Firestore REST API.
 * Même approche que lib/firestore.js, pas besoin de l'Admin SDK.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'influence-beymedias';
const API_KEY    = process.env.FIREBASE_API_KEY    || 'AIzaSyDu00l36bLr_WxLvP4l9zMCnvLpY3GNwqE';
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

/**
 * Vérifie si l'utilisateur a encore du quota Surfe aujourd'hui.
 * @returns {{ allowed: boolean, used: number, limit: number }}
 */
export async function checkQuota(email, limit) {
  if (limit === -1) return { allowed: true, used: 0, limit };
  if (limit === 0)  return { allowed: false, used: 0, limit };

  const url = `${BASE_URL}/users/${encodeURIComponent(email)}/surfe_usage/${todayKey()}?key=${API_KEY}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });

  if (resp.status === 404) return { allowed: true, used: 0, limit };
  if (!resp.ok) throw new Error(`Firestore GET ${resp.status}`);

  const doc = await resp.json();
  const used = Number(doc?.fields?.count?.integerValue ?? 0);
  return { allowed: used < limit, used, limit };
}

/**
 * Incrémente le compteur du jour de façon atomique (FieldTransform).
 * Crée le document s'il n'existe pas encore.
 */
export async function incrementUsage(email) {
  const docName = `projects/${PROJECT_ID}/databases/(default)/documents/users/${email}/surfe_usage/${todayKey()}`;
  const url = `${BASE_URL}:commit?key=${API_KEY}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [{
        transform: {
          document: docName,
          fieldTransforms: [{ fieldPath: 'count', increment: { integerValue: '1' } }],
        },
      }],
    }),
    signal: AbortSignal.timeout(4000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Firestore commit ${resp.status}: ${err}`);
  }
}
