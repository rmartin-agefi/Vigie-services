import { Router } from 'express';
import { soqlQuery, escapeSoql, CONTACT_FIELDS } from '../../lib/salesforce.js';

const router = Router();

// GET /webhook/salesforce-search-link?linkedinUrl=...
router.get('/', async (req, res) => {
  const { linkedinUrl } = req.query;
  if (!linkedinUrl) return res.status(400).json({ error: 'linkedinUrl requis' });

  // Prépare les deux variantes : décodée et encodée
  let decoded = linkedinUrl;
  try { decoded = decodeURIComponent(linkedinUrl); } catch (_) {}
  const encoded = encodeURIComponent(decoded);
  const slugsToTry = decoded !== linkedinUrl ? [decoded, linkedinUrl] : [decoded];

  try {
    for (const slug of slugsToTry) {
      const records = await soqlQuery(
        `SELECT ${CONTACT_FIELDS} FROM Contact WHERE lien_linkedin_indiv__c LIKE '%${escapeSoql(slug)}%' LIMIT 5`
      );
      if (records.length > 0) return res.json([{ records }]);
    }
    return res.json([{ records: [] }]);
  } catch (err) {
    console.error('[salesforce-search-link] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
