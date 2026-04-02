const PIANO_API = 'https://api-eu.piano.io/api/v3/publisher';

/**
 * Vérifie si un email a des abonnements actifs sur une publication Piano.
 * @param {string} email
 * @param {string} aid       - App ID Piano
 * @param {string} apiToken  - API token Piano
 * @param {string} publication - 'agefi' | 'opinion'
 * @returns {{ found: boolean, publication: string, count: number, subscriptions: array }
 *          | { found: false, [publication]: false }}
 */
export async function checkPianoAccess(email, aid, apiToken, publication) {
  // 1. Chercher l'utilisateur par email
  const userUrl = new URL(`${PIANO_API}/user/list`);
  userUrl.searchParams.set('aid', aid);
  userUrl.searchParams.set('api_token', apiToken);
  userUrl.searchParams.set('q', email);
  userUrl.searchParams.set('count', '1');

  const userRes = await fetch(userUrl.toString());
  if (!userRes.ok) throw new Error(`Piano user/list error: ${userRes.status}`);
  const userData = await userRes.json();

  if (!userData.total || userData.total === 0) {
    return { found: false, [publication]: false };
  }

  const uid = userData.users[0].uid;

  // 2. Récupérer ses accès
  const accessUrl = new URL(`${PIANO_API}/user/access/list`);
  accessUrl.searchParams.set('api_token', apiToken);
  accessUrl.searchParams.set('aid', aid);
  accessUrl.searchParams.set('uid', uid);

  const accessRes = await fetch(accessUrl.toString());
  if (!accessRes.ok) throw new Error(`Piano user/access/list error: ${accessRes.status}`);
  const accessData = await accessRes.json();

  // 3. Filtrer les accès accordés
  const accesses = accessData.accesses ?? [];
  const subscriptions = accesses
    .filter(a => a.granted === true)
    .map(a => ({
      name:    a.resource.name,
      rid:     a.resource.rid,
      url:     a.resource.resource_url,
      since:   a.start_date  ? new Date(a.start_date  * 1000).toISOString().split('T')[0] : null,
      expires: a.expire_date ? new Date(a.expire_date * 1000).toISOString().split('T')[0] : null,
    }));

  return {
    found: subscriptions.length > 0,
    publication,
    count: subscriptions.length,
    subscriptions,
  };
}
