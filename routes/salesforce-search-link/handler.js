import { Router } from 'express';
import { soqlQuery, escapeSoql, CONTACT_FIELDS } from '../../lib/salesforce.js';

const router = Router();

// GET /webhook/salesforce-search-link?linkedinUrl=...
router.get('/', async (req, res) => {
  const { linkedinUrl } = req.query;
  if (!linkedinUrl) return res.status(400).json({ error: 'linkedinUrl requis' });

  // Express auto-décode les query params → linkedinUrl est déjà décodé (ë, pas %C3%AB)
  // On génère les deux variantes et on échappe % → \% pour SOQL LIKE
  let decoded = linkedinUrl;
  try { decoded = decodeURIComponent(linkedinUrl); } catch (_) {}
  const reEncoded = encodeURIComponent(decoded);
  const escapeLike = v => escapeSoql(v).replace(/%/g, '\\%');

  const conditions = decoded === reEncoded
    ? [`lien_linkedin_indiv__c LIKE '%${escapeLike(decoded)}%'`]
    : [
        `lien_linkedin_indiv__c LIKE '%${escapeLike(decoded)}%'`,
        `lien_linkedin_indiv__c LIKE '%${escapeLike(reEncoded)}%'`,
      ];
  const where = conditions.length === 1 ? conditions[0] : `(${conditions.join(' OR ')})`;

  try {
    const records = await soqlQuery(
      `SELECT ${CONTACT_FIELDS} FROM Contact WHERE ${where} LIMIT 5`
    );
    return res.json([{ records }]);
  } catch (err) {
    console.error('[salesforce-search-link] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
