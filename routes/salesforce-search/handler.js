import { Router } from 'express';
import { soqlQuery, escapeSoql, CONTACT_FIELDS } from '../../lib/salesforce.js';

const router = Router();

// GET /webhook/salesforce-search?name=...
router.get('/', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name requis' });

  try {
    const records = await soqlQuery(
      `SELECT ${CONTACT_FIELDS} FROM contact WHERE Name LIKE '%${escapeSoql(name)}%' LIMIT 5`
    );
    return res.json([{ records }]);
  } catch (err) {
    console.error('[salesforce-search] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
