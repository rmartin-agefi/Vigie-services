import { Router } from 'express';
import { soqlQuery, escapeSoql, CONTACT_FIELDS } from '../../lib/salesforce.js';

const router = Router();

// GET /webhook/salesforce-search?name=...
router.get('/', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name requis' });

  try {
    const escaped = escapeSoql(name);
    // Si le nom contient un tiret, chercher aussi la variante avec espace (et inversement)
    // Variante tiret↔espace uniquement si le nom contient un tiret
    const alt = name.includes('-') ? escapeSoql(name.replace(/-/g, ' ')) : null;

    const where = alt
      ? `(Name LIKE '%${escaped}%' OR Name LIKE '%${alt}%')`
      : `Name LIKE '%${escaped}%'`;

    const records = await soqlQuery(
      `SELECT ${CONTACT_FIELDS} FROM contact WHERE ${where} LIMIT 5`
    );
    return res.json([{ records }]);
  } catch (err) {
    console.error('[salesforce-search] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
