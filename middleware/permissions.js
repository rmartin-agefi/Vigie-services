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
 * @param {...string} moduleKeys - clés de modules requis (logique OR : au moins un doit être actif)
 * Exemples :
 *   requirePermission('eh')             → eh doit être true
 *   requirePermission('eh', 'alpha')    → eh OU alpha doit être true
 */
export function requirePermission(...moduleKeys) {
  return async (req, res, next) => {
    // Dev mode — bypass complet
    if (req.user?.authBypass) return next();

    if (!req.user?.email) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    try {
      const perms = await getUserPermissions(req.user.email);
      const allowed = moduleKeys.some(key => perms[key]);
      if (!allowed) {
        console.warn(`[Permissions] Refusé (${req.user.email}) — modules requis: ${moduleKeys.join(' ou ')}`);
        return res.status(403).json({
          error: 'Accès refusé',
          detail: `Aucun des modules requis (${moduleKeys.join(', ')}) n'est activé pour ce compte`,
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
