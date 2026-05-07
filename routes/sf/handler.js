import { Router } from 'express';
import { soslSearch, escapeSosl } from '../../lib/salesforce.js';

const router = Router();

// GET /webhook/sf/accounts?q=... — Autocomplete comptes SF
router.get('/accounts', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const normalized = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const term = escapeSosl(normalized);
  const sosl = `FIND {${term}*} IN NAME FIELDS RETURNING Account(Id, Name, ParentId, Parent.Name LIMIT 10)`;

  try {
    const records = await soslSearch(sosl);
    const results = records.map(r => ({
      id:         r.Id,
      name:       r.Name,
      parentName: r.Parent?.Name || null,
    }));
    return res.json(results);
  } catch (err) {
    console.error('[sf/accounts] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /webhook/sf/create — À implémenter après meeting tuteur (noms de champs SF)
router.post('/create', async (req, res) => {
  console.log('[sf/create] payload reçu:', JSON.stringify(req.body));
  return res.status(501).json({ error: 'Non implémenté — en attente noms de champs SF' });
});

// POST /webhook/sf/update — À implémenter après meeting tuteur (noms de champs SF)
router.post('/update', async (req, res) => {
  console.log('[sf/update] payload reçu:', JSON.stringify(req.body));
  return res.status(501).json({ error: 'Non implémenté — en attente noms de champs SF' });
});

export default router;
