import { Router } from 'express';
import { soslSearch } from '../../lib/salesforce.js';

const router = Router();

const SF_BASE              = 'https://agefi.lightning.force.com';
const GUARD_CONTACT_FIELDS = 'Id, FirstName, LastName, Name, Titre_exact_op__c, Fonction_Niveau_1__c, Email, Account.Name, lien_linkedin_indiv__c';
const GUARD_LEAD_FIELDS    = 'Id, FirstName, LastName, Name, Title, Email, Company';
const GUARD_ACCOUNT_FIELDS = 'Id, Name, Industry, Website';

// ── Normalisation ─────────────────────────────────────────────

const FR_PARTICLES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'd', 'l', 'et', 'en', 'von', 'van', 'ter', 'den']);

function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-''']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSoslTokens(name) {
  const tokens = normalize(name)
    .replace(/[^a-z0-9\s]/g, '')
    .split(' ')
    .filter(t => t.length > 0 && !FR_PARTICLES.has(t));

  // Tokens déjà [a-z0-9] après normalize — pas besoin d'escapeSosl
  // * = wildcard prefix (supporté REST), OR = au moins 1 token suffit
  return tokens
    .map(t => t.length >= 4 ? `${t}*` : t)
    .join(' OR ');
}

// ── Scoring ───────────────────────────────────────────────────

function significantTokens(name) {
  return normalize(name)
    .replace(/[^a-z0-9\s]/g, '')
    .split(' ')
    .filter(t => t.length > 0 && !FR_PARTICLES.has(t));
}

function scoreName(candidateName, searchName) {
  const a = significantTokens(candidateName);
  const b = significantTokens(searchName);
  if (!a.length || !b.length) return 0;

  // Exact après normalisation
  if (a.join(' ') === b.join(' ')) return 100;

  // Combien de tokens de b sont présents dans a (exact ou 1 char off)
  const matchingTokens = b.filter(bt =>
    a.some(at => at === bt || levenshtein(at, bt) <= 1)
  );
  const matches = matchingTokens.length;

  if (matches === b.length) return 85;
  if (matches > 0) {
    const base = Math.round((matches / b.length) * 60);
    // Token long (≥5 chars) qui matche = nom de famille rare → score minimum 50
    const hasRareMatch = matchingTokens.some(t => t.length >= 5);
    return hasRareMatch ? Math.max(base, 50) : base;
  }
  return 0;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? dp[j - 1] : Math.min(dp[j - 1], dp[j], prev) + 1;
      dp[j - 1] = prev;
      prev = val;
    }
    dp[b.length] = prev;
  }
  return dp[b.length];
}

function scoreCompany(candidateCompany, detectedCompanies) {
  if (!candidateCompany || !detectedCompanies?.length) return 0;
  const cNorm = normalize(candidateCompany);
  for (const dc of detectedCompanies) {
    const dcNorm = normalize(dc);
    if (!dcNorm) continue;
    if (cNorm === dcNorm || cNorm.includes(dcNorm) || dcNorm.includes(cNorm)) return 100;
    const cSet     = new Set(cNorm.split(' ').filter(t => t.length > 2));
    const dcTokens = dcNorm.split(' ').filter(t => t.length > 2);
    if (dcTokens.length) {
      const overlap = dcTokens.filter(t => cSet.has(t)).length;
      if (overlap === dcTokens.length) return 80;
      if (overlap > 0) return Math.round((overlap / dcTokens.length) * 50);
    }
  }
  return 0;
}

function buildReasons(nameScore, companyScore) {
  const r = [];
  if      (nameScore === 100) r.push('Nom identique');
  else if (nameScore >= 85)   r.push('Nom quasi-identique');
  else if (nameScore >= 50)   r.push('Nom proche');
  if      (companyScore === 100) r.push('Entreprise identique');
  else if (companyScore >= 80)   r.push('Entreprise quasi-identique');
  else if (companyScore >= 50)   r.push('Entreprise proche');
  return r;
}

// ── Handler ───────────────────────────────────────────────────

router.post('/search', async (req, res) => {
  const { type, name, detectedCompanies = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });

  const soslTokens = toSoslTokens(name);
  if (!soslTokens) return res.status(400).json({ error: 'Nom invalide' });

  try {
    let rawRecords = [];

    if (type === 'person') {
      const sosl = `FIND {${soslTokens}} IN NAME FIELDS RETURNING Contact(${GUARD_CONTACT_FIELDS} LIMIT 10), Lead(${GUARD_LEAD_FIELDS} LIMIT 10)`;
      rawRecords = await soslSearch(sosl);
    } else {
      const sosl = `FIND {${soslTokens}} IN NAME FIELDS RETURNING Account(${GUARD_ACCOUNT_FIELDS} LIMIT 10)`;
      rawRecords = await soslSearch(sosl);
    }

    const candidates = [];

    for (const r of rawRecords) {
      const sfType           = r.attributes?.type || 'Contact';
      const candidateName    = r.Name || `${r.FirstName || ''} ${r.LastName || ''}`.trim();
      const candidateCompany = sfType === 'Lead' ? (r.Company || '') : (r.Account?.Name || '');
      const nameScore        = scoreName(candidateName, name);
      const companyScore     = type === 'person' ? scoreCompany(candidateCompany, detectedCompanies) : 0;
      const score            = type === 'person'
        ? Math.round(nameScore * 0.55 + companyScore * 0.45)
        : nameScore;

      if (score < 30) continue;

      candidates.push({
        salesforceId:  r.Id,
        type:          sfType,
        name:          candidateName,
        title:         r.Titre_exact_op__c || r.Fonction_Niveau_1__c || r.Title || '',
        company:       candidateCompany,
        email:         r.Email || null,
        score,
        reasons:       buildReasons(nameScore, companyScore),
        salesforceUrl: `${SF_BASE}/lightning/r/${sfType}/${r.Id}/view`,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const top    = candidates.slice(0, 5);
    const best   = top[0]?.score ?? 0;
    const status = best >= 85 ? 'match_strong' : best >= 50 ? 'match_possible' : 'no_match';

    console.log(`[sf-guard] ${type} "${name}" → ${status} (${top.length} candidats)`);

    return res.json({
      requestId: `sfguard_${Date.now()}`,
      status,
      blocking:    false,
      blockReason: null,
      candidates:  top,
    });

  } catch (err) {
    console.error('[sf-guard] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
