import { Router } from 'express';

const router = Router();

// POST /webhook/sf/create — À implémenter (SF Guard étape finale)
router.post('/create', async (req, res) => {
  console.log('[sf/create] payload reçu:', JSON.stringify(req.body));
  return res.status(501).json({ error: 'Non implémenté — en attente SF Guard search' });
});

// POST /webhook/sf/update — À implémenter (SF Guard étape finale)
router.post('/update', async (req, res) => {
  console.log('[sf/update] payload reçu:', JSON.stringify(req.body));
  return res.status(501).json({ error: 'Non implémenté — en attente SF Guard search' });
});

export default router;
