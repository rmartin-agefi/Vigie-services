import { createRemoteJWKSet, jwtVerify } from 'jose';

const TENANT   = '2e1f24be-c89e-4913-b1a1-dd9c58e71e5f';
const JWKS_URL = `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`;
const JWKS     = createRemoteJWKSet(new URL(JWKS_URL));

// Cache de tokens validés : token → { exp, userId }
const _cache   = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function validateToken(token) {
  const cached = _cache.get(token);
  if (cached && Date.now() < cached.exp) return cached.userId;

  // Tentative 1 : validation JWKS (token d'accès Azure AD)
  try {
    const { payload } = await jwtVerify(token, JWKS, { algorithms: ['RS256'] });
    if (payload.tid !== TENANT) throw new Error(`Tenant inattendu : ${payload.tid}`);
    const userId = payload.oid ?? payload.sub;
    _cache.set(token, { exp: Date.now() + CACHE_TTL, userId });
    return userId;
  } catch (err) {
    console.warn('[auth] JWKS échec :', err.message, '— fallback Graph');
  }

  // Tentative 2 : fallback Microsoft Graph /me (Graph token non-JWT ou clé tournée)
  const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const me = await resp.json();
  if (!me.id) return null;

  _cache.set(token, { exp: Date.now() + CACHE_TTL, userId: me.id });
  return me.id;
}

export async function authMiddleware(req, res, next) {
  if (process.env.AUTH_REQUIRED === 'false') return next();

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  try {
    const userId = await validateToken(token);
    if (!userId) return res.status(401).json({ error: 'Token invalide ou tenant incorrect' });
    req.userId = userId;
    next();
  } catch (err) {
    console.error('[auth] Erreur validation :', err.message);
    return res.status(401).json({ error: 'Erreur authentification' });
  }
}
