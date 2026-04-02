/**
 * Azure AD JWT authentication middleware.
 *
 * Les tokens émis par chrome.identity avec scope "User.Read" sont des tokens
 * Microsoft Graph (aud = "https://graph.microsoft.com"), pas des tokens
 * applicatifs. On valide donc :
 *   Stratégie 1 — JWT : signature RS256 + issuer (sans audience check)
 *   Stratégie 2 — Graph API /me : introspection si le JWT échoue
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_REQUIRED  = (process.env.AUTH_REQUIRED || 'true').toLowerCase() === 'true';
const TENANT_ID      = process.env.AZURE_TENANT_ID || '2e1f24be-c89e-4913-b1a1-dd9c58e71e5f';
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  : [];

const JWKS_URL = `https://login.microsoftonline.com/common/discovery/v2.0/keys`;

// Cache token → { user, exp } pour éviter un appel Graph à chaque requête
const _tokenCache = new Map();
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutes

let _jwks = null;
function getJWKS() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(JWKS_URL));
  return _jwks;
}

// Probe au démarrage pour diagnostiquer si le JWKS est accessible
fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) })
  .then(r => console.log(`[Auth] JWKS probe : HTTP ${r.status}`))
  .catch(e => console.warn(`[Auth] JWKS inaccessible : ${e.message} — fallback Graph sera utilisé`));

// ── Stratégie 1 : validation JWT sans audience check ────────────────────────
async function validateAsJWT(token) {
  const { payload } = await jwtVerify(token, getJWKS(), {
    issuer: [
      `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      `https://sts.windows.net/${TENANT_ID}/`,
    ],
    // Pas de vérification d'audience : le token Graph a
    // aud="https://graph.microsoft.com", pas notre CLIENT_ID
  });

  const email = (payload.preferred_username || payload.email || payload.upn || '').toLowerCase();
  return { method: 'jwt', email, sub: payload.sub, tid: payload.tid, tokenExp: payload.exp };
}

// ── Stratégie 2 : introspection via Microsoft Graph /me ─────────────────────
async function validateViaGraph(token) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API ${res.status}: ${body}`);
  }
  const profile = await res.json();
  const email = (profile.mail || profile.userPrincipalName || '').toLowerCase();
  return { method: 'graph', email, sub: profile.id, tid: null, tokenExp: null };
}

// ── Middleware ───────────────────────────────────────────────────────────────
export async function authMiddleware(req, res, next) {
  if (!AUTH_REQUIRED) {
    req.user = { email: 'anonymous', authBypass: true };
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise', authRequired: true });
  }

  const token = authHeader.slice(7);

  // Cache hit — évite un appel réseau à chaque requête
  const cached = _tokenCache.get(token);
  if (cached && Date.now() < cached.exp) {
    req.user = cached.user;
    return next();
  }

  let user;
  try {
    user = await validateAsJWT(token);
    console.log(`[Auth] JWT OK (${user.email})`);
  } catch (jwtErr) {
    console.log(`[Auth] JWT échoué (${jwtErr.message}), fallback Graph…`);
    try {
      user = await validateViaGraph(token);
      console.log(`[Auth] Graph OK (${user.email})`);
    } catch (graphErr) {
      console.error(`[Auth] Échec total: ${graphErr.message}`);
      return res.status(401).json({ error: 'Token invalide', detail: graphErr.message, authRequired: true });
    }
  }

  _tokenCache.set(token, { user, exp: Date.now() + CACHE_TTL });

  if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(user.email)) {
    console.warn(`[Auth] Refusé: ${user.email}`);
    return res.status(403).json({ error: 'Accès refusé', detail: `${user.email} non autorisé` });
  }

  req.user = user;
  next();
}
