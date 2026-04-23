import { Router } from 'express';
import { soqlQuery, escapeSoql, CONTACT_FIELDS } from '../../lib/salesforce.js';

const router = Router();

// GET /webhook/salesforce-search?name=...
router.get('/', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name requis' });

  try {
    const nfc      = s => s.normalize('NFC');
    const stripAcc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nameNfc  = nfc(name);
    const variants = new Set([nameNfc]);

    // Variante sans accents si le nom en contient
    const stripped = stripAcc(nameNfc);
    if (stripped !== nameNfc) variants.add(stripped);

    // Variante tiret↔espace
    if (nameNfc.includes('-')) variants.add(nameNfc.replace(/-/g, ' '));
    if (stripped.includes('-')) variants.add(stripped.replace(/-/g, ' '));

    const conditions = [...variants].map(v => `Name LIKE '%${escapeSoql(v)}%'`);
    const where = conditions.length === 1 ? conditions[0] : `(${conditions.join(' OR ')})`;

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
