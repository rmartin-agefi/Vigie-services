/**
 * Middleware de vérification des permissions par module.
 *
 * Usage : requirePermission('eh'), requirePermission('linkedin'), etc.
 * Doit être appliqué après authMiddleware (req.user doit exister).
 *
 * En dev (authBypass=true), le check est sauté.
 */

import { getUserPermissions } from '../lib/firestore.js';

/**
 * @param {string} moduleKey - 'eh' | 'linkedin' | 'alpha' | 'llm'
 */
export function requirePermission(moduleKey) {
  return async (req, res, next) => {
    // Dev mode — bypass complet
    if (req.user?.authBypass) return next();

    if (!req.user?.email) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    try {
      const perms = await getUserPermissions(req.user.email);
      if (!perms[moduleKey]) {
        console.warn(`[Permissions] Refusé (${req.user.email}) — module ${moduleKey}`);
        return res.status(403).json({
          error: 'Accès refusé',
          detail: `Module "${moduleKey}" non activé pour ce compte`,
          authRequired: false,
        });
      }
      next();
    } catch (err) {
      console.error(`[Permissions] Erreur Firestore: ${err.message}`);
      return res.status(503).json({ error: 'Service de permissions indisponible' });
    }
  };
}
