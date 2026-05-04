import { Firestore, FieldValue } from '@google-cloud/firestore';

const db = new Firestore({ projectId: 'influence-beymedias' });

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

/**
 * Vérifie si l'utilisateur a encore du quota Surfe aujourd'hui.
 * @param {string} email
 * @param {number} limit  -1 = illimité, 0 = bloqué, N = max/jour
 * @returns {{ allowed: boolean, used: number, limit: number }}
 */
export async function checkQuota(email, limit) {
  if (limit === -1) return { allowed: true, used: 0, limit };
  if (limit === 0)  return { allowed: false, used: 0, limit };

  const ref = db.collection('users').doc(email).collection('surfe_usage').doc(todayKey());
  const snap = await ref.get();
  const used = snap.exists ? (snap.data().count ?? 0) : 0;
  return { allowed: used < limit, used, limit };
}

/**
 * Incrémente le compteur d'usage Surfe du jour (atomique).
 * À appeler uniquement après un enrichissement réussi.
 */
export async function incrementUsage(email) {
  const ref = db.collection('users').doc(email).collection('surfe_usage').doc(todayKey());
  await ref.set(
    { count: FieldValue.increment(1), updatedAt: new Date() },
    { merge: true }
  );
}
