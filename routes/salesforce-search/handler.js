import { Router } from 'express';
import { soqlQuery, soslSearch, escapeSoql, escapeSosl, CONTACT_FIELDS } from '../../lib/salesforce.js';

const router = Router();

const nfc          = s => s.normalize('NFC');
const stripAcc     = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// Normalise espaces autour des apostrophes : "d' Hauteville" → "d Hauteville"
const normalizeApo = s => s.replace(/\s*'\s*/g, ' ').replace(/\s+/g, ' ').trim();
const toSoslTokens = name => stripAcc(nfc(name)).toLowerCase().replace(/-/g, ' ').trim();
const escapeLike   = v => escapeSoql(v).replace(/%/g, '\\%');

// GET /webhook/salesforce-search?name=...&linkedinUrl=... (linkedinUrl optionnel)
router.get('/', async (req, res) => {
  const { name, linkedinUrl } = req.query;
  if (!name) return res.status(400).json({ error: 'name requis' });

  try {
    // ── 1. SOSL par nom — tokens accent-insensitive ──────────────
    const soslQuery = `FIND {${escapeSosl(toSoslTokens(name))}} IN NAME FIELDS RETURNING Contact(${CONTACT_FIELDS}) LIMIT 5`;

    // ── 2. SOQL par URL LinkedIn (si fournie) ────────────────────
    let urlSoql = null;
    if (linkedinUrl) {
      let decoded = linkedinUrl;
      try { decoded = decodeURIComponent(linkedinUrl); } catch (_) {}
      const reEncoded = encodeURIComponent(decoded);
      const conditions = decoded === reEncoded
        ? [`lien_linkedin_indiv__c LIKE '%${escapeLike(decoded)}%'`]
        : [
            `lien_linkedin_indiv__c LIKE '%${escapeLike(decoded)}%'`,
            `lien_linkedin_indiv__c LIKE '%${escapeLike(reEncoded)}%'`,
          ];
      const where = conditions.length === 1 ? conditions[0] : `(${conditions.join(' OR ')})`;
      urlSoql = `SELECT ${CONTACT_FIELDS} FROM Contact WHERE ${where} LIMIT 5`;
    }

    // ── 3. Exécution en parallèle ────────────────────────────────
    const [soslResult, soqlResult] = await Promise.allSettled([
      soslSearch(soslQuery),
      urlSoql ? soqlQuery(urlSoql) : Promise.resolve([]),
    ]);

    const byName = soslResult.status === 'fulfilled' ? soslResult.value : [];
    const byUrl  = soqlResult.status === 'fulfilled' ? soqlResult.value : [];

    if (soslResult.status === 'rejected')
      console.error('[salesforce-search] SOSL error:', soslResult.reason?.message);
    if (soqlResult.status === 'rejected')
      console.error('[salesforce-search] SOQL URL error:', soqlResult.reason?.message);

    // ── 4. Fusion + déduplication par Id (byUrl en premier = plus précis) ──
    const seen = new Set();
    const merged = [];
    for (const r of [...byUrl, ...byName]) {
      if (!seen.has(r.Id)) { seen.add(r.Id); merged.push(r); }
    }

    // ── 5. Filtrage client-side : évite les faux-positifs SOSL (ex: "Colin" ≠ "Collin")
    // byUrl = match LinkedIn exact → toujours garder
    const urlIds   = new Set(byUrl.map(r => r.Id));
    const nameNorm = normalizeApo(stripAcc(nfc(name)).toLowerCase());
    const records  = merged.filter(r => {
      if (urlIds.has(r.Id)) return true;
      if (!r.Name) return false;
      const sfNorm = normalizeApo(stripAcc(nfc(r.Name)).toLowerCase());
      return sfNorm.includes(nameNorm) || nameNorm.includes(sfNorm);
    });

    return res.json([{ records }]);
  } catch (err) {
    console.error('[salesforce-search] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
