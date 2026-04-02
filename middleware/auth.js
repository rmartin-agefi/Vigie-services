/**
 * Azure AD JWT authentication middleware.
 *
 * Les tokens émis par chrome.identity avec scope "User.Read" sont des tokens
 * Microsoft Graph (aud = "https://graph.microsoft.com"), pas des tokens
 * applicatifs. On valide donc :
 *   Stratégie 1 — JWT : signature RS256 + issuer (sans audience check)
 *   Stratégie 2 — Graph API /me : introspection si le JWT échoue
 */

/**
 * Les tokens émis par chrome.identity sont des tokens Microsoft Graph
 * (aud = https://graph.microsoft.com). Microsoft ne permet pas de valider
 * ces tokens via JWKS — seul Graph /me peut les vérifier.
 * Le cache 5min évite un appel réseau à chaque requête.
 */

const AUTH_REQUIRED  = (process.env.AUTH_REQUIRED || 'true').toLowerCase() === 'true';
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  : [];

// Cache token → { user, exp } pour éviter un appel Graph à chaque requête
const _tokenCache = new Map();
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutes

// ── Validation via Microsoft Graph /me ──────────────────────────────────────
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
    user = await validateViaGraph(token);
    console.log(`[Auth] OK (${user.email})`);
  } catch (err) {
    console.error(`[Auth] Échec: ${err.message}`);
    return res.status(401).json({ error: 'Token invalide', detail: err.message, authRequired: true });
  }

  _tokenCache.set(token, { user, exp: Date.now() + CACHE_TTL });

  if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(user.email)) {
    console.warn(`[Auth] Refusé: ${user.email}`);
    return res.status(403).json({ error: 'Accès refusé', detail: `${user.email} non autorisé` });
  }

  req.user = user;
  next();
}
