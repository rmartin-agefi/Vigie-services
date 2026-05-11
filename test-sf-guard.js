// test-sf-guard.js — lancer avec: node --env-file=.env test-sf-guard.js "Jean-Baptiste Gratieaux" person
// Teste la logique sf-guard directement sans passer par le serveur

import { soslSearch } from './lib/salesforce.js';

const name = process.argv[2] || 'Jean-Baptiste Gratieaux';
const type = process.argv[3] || 'person';

// ── Copie exacte des fonctions de routes/sf-guard/handler.js ──

const FR_PARTICLES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'd', 'l', 'et', 'en', 'von', 'van', 'ter', 'den']);

function normalize(s) {
  return String(s || '')
    .replace(/[Œœ]/g, 'oe').replace(/[Ææ]/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['''‚‛ʼ`´]/g, ' ')
    .replace(/[-‐‑‒–—―−]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function significantTokens(n) {
  return normalize(n).split(' ').filter(t => t.length > 0 && !FR_PARTICLES.has(t));
}

function toSoslTokens(n) {
  return significantTokens(n).join(' OR ');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i-1] === b[j-1] ? dp[j-1] : Math.min(dp[j-1], dp[j], prev) + 1;
      dp[j-1] = prev; prev = val;
    }
    dp[b.length] = prev;
  }
  return dp[b.length];
}

function scoreName(candidateName, searchName) {
  const a = significantTokens(candidateName);
  const b = significantTokens(searchName);
  if (!a.length || !b.length) return 0;
  if (a.join(' ') === b.join(' ')) return 100;
  const matchingTokens = b.filter(bt => a.some(at => at === bt || levenshtein(at, bt) <= 1));
  const matches = matchingTokens.length;
  if (matches === b.length) return 85;
  if (matches > 0) {
    const base = Math.round((matches / b.length) * 60);
    return matchingTokens.some(t => t.length >= 5) ? Math.max(base, 50) : base;
  }
  return 0;
}

// ── Main ──────────────────────────────────────────────────────

const tokens = significantTokens(name);
const soslTokens = toSoslTokens(name);

console.log('\n=== SF Guard Test ===');
console.log('Recherche  :', name);
console.log('Type       :', type);
console.log('Tokens     :', tokens);
console.log('SOSL tokens:', soslTokens);

const CONTACT_LIMIT = parseInt(process.argv[4] || '150');
const CONTACT_FIELDS = 'Id, FirstName, LastName, Name, Titre_exact_op__c, Fonction_Niveau_1__c, Email, Account.Name';
const ACCOUNT_FIELDS = 'Id, Name, Industry';

console.log('LIMIT Contact:', CONTACT_LIMIT);

const sosl = type === 'person'
  ? `FIND {${soslTokens}} IN NAME FIELDS RETURNING Contact(${CONTACT_FIELDS} LIMIT ${CONTACT_LIMIT}), Lead(Id, FirstName, LastName, Name, Title, Email, Company LIMIT 10)`
  : `FIND {${soslTokens}} IN NAME FIELDS RETURNING Account(${ACCOUNT_FIELDS} LIMIT 15)`;

console.log('\nSOSL:', sosl);
console.log('\n--- Résultats bruts SF ---');

const rawRecords = await soslSearch(sosl);
console.log(`SF a retourné ${rawRecords.length} record(s)\n`);

rawRecords.forEach((r, i) => {
  const candidateName = r.Name || `${r.FirstName || ''} ${r.LastName || ''}`.trim();
  const ns = scoreName(candidateName, name);
  const tokens_a = significantTokens(candidateName);
  const tokens_b = significantTokens(name);
  const matchDetail = tokens_b.map(bt => {
    const best = tokens_a.reduce((min, at) => Math.min(min, levenshtein(at, bt)), 99);
    return `${bt}→lev=${best}(${best <= 1 ? '✓' : '✗'})`;
  }).join(' | ');
  console.log(`[${i+1}] ${candidateName.padEnd(35)} score=${ns}  ${matchDetail}`);
});

console.log('\n--- Top candidats (score ≥ 45) ---');
const scored = rawRecords
  .map(r => {
    const candidateName = r.Name || `${r.FirstName || ''} ${r.LastName || ''}`.trim();
    return { name: candidateName, score: scoreName(candidateName, name) };
  })
  .filter(c => c.score >= 45)
  .sort((a, b) => b.score - a.score);

if (!scored.length) console.log('(aucun candidat au-dessus du seuil 45)');
scored.forEach(c => console.log(`  ${c.score}%  ${c.name}`));
