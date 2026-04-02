// Auth Azure AD — TODO #7
// En dev : AUTH_REQUIRED=false bypass tout
// En prod : valide le JWT Bearer via JWKS Microsoft
// Tenant : 2e1f24be-... | Client : fa1d6eb7-...

export function authMiddleware(req, res, next) {
  if (process.env.AUTH_REQUIRED === 'false') return next();

  // TODO #7 : valider le JWT Bearer
  // const token = req.headers.authorization?.split(' ')[1];
  // if (!token) return res.status(401).json({ error: 'Token manquant' });
  // Valider via JWKS : https://login.microsoftonline.com/<tid>/discovery/v2.0/keys
  // Vérifier que tid === '2e1f24be-...'

  next(); // Temporaire — à remplacer par la vraie validation
}
