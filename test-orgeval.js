// test-orgeval.js — node --env-file=.env test-orgeval.js

import { soslSearch, escapeSosl } from './lib/salesforce.js';

const nfc      = s => s.normalize('NFC');
const stripAcc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Version actuelle (buguee : ne couvre pas U+2019)
function toSoslTokensCurrent(name) {
  return stripAcc(nfc(name)).toLowerCase().replace(/-/g, ' ').replace(/['‘]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Version fixee : tous les apostrophes + filtrage particules
const PARTICLES = new Set(['de', 'du', 'des', 'le', 'la', 'les', "d", 'l', 'et', 'en', 'von', 'van', 'ter', 'den']);
function toSoslTokensFixed(name) {
  const base = stripAcc(nfc(name)).toLowerCase()
    .replace(/-/g, ' ')
    .replace(/['‘’ʼ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return base.split(' ').filter(t => t.length > 0 && !PARTICLES.has(t)).join(' ');
}

// normalizeApo actuel (bugue sur U+2019)
const normalizeApoCurrent = s => s.replace(/\s*['‘]\s*/g, ' ').replace(/\s+/g, ' ').trim();

// normalizeApo fixe
const normalizeApoFixed = s => s.replace(/\s*['‘’ʼ]\s*/g, ' ').replace(/\s+/g, ' ').trim();

const CONTACT_FIELDS = 'Id, FirstName, LastName, Name, Titre_exact_op__c, Fonction_Niveau_1__c, Account.Name';

// Les deux variants qui peuvent arriver depuis le LLM
const STRAIGHT = "Philippe d'Orgeval"; // U+0027
const CURLY    = "Philippe d’Orgeval"; // U+2019 (le plus frequent en francais)

console.log('\n=== Diagnostic tokens ===');
for (const [label, v] of [['U+0027 (droit)', STRAIGHT], ['U+2019 (curly)', CURLY]]) {
  console.log(`\n${label}: "${v}"`);
  console.log(`  toSoslTokensCurrent : "${toSoslTokensCurrent(v)}"`);
  console.log(`  toSoslTokensFixed   : "${toSoslTokensFixed(v)}"`);
  console.log(`  normalizeApoCurrent : "${normalizeApoCurrent(stripAcc(nfc(v)).toLowerCase())}"`);
  console.log(`  normalizeApoFixed   : "${normalizeApoFixed(stripAcc(nfc(v)).toLowerCase())}"`);
}

// --- SOSL tests ---

console.log('\n\n=== Test 1 : token actuel U+0027 ===');
const sosl1 = `FIND {${escapeSosl(toSoslTokensCurrent(STRAIGHT))}} IN ALL FIELDS RETURNING Contact(${CONTACT_FIELDS} LIMIT 10)`;
console.log('SOSL:', sosl1);
const r1 = await soslSearch(sosl1);
console.log(`-> ${r1.length} resultat(s)`);
r1.forEach(r => console.log(`   "${r.Name}" @ ${r.Account?.Name || '?'}`));

console.log('\n=== Test 2 : token actuel U+2019 ===');
const sosl2 = `FIND {${escapeSosl(toSoslTokensCurrent(CURLY))}} IN ALL FIELDS RETURNING Contact(${CONTACT_FIELDS} LIMIT 10)`;
console.log('SOSL:', sosl2);
const r2 = await soslSearch(sosl2);
console.log(`-> ${r2.length} resultat(s)`);
r2.forEach(r => console.log(`   "${r.Name}" @ ${r.Account?.Name || '?'}`));

console.log('\n=== Test 3 : juste "orgeval" (reference) ===');
const sosl3 = `FIND {orgeval} IN ALL FIELDS RETURNING Contact(${CONTACT_FIELDS} LIMIT 10)`;
const r3 = await soslSearch(sosl3);
console.log(`-> ${r3.length} resultat(s)`);
r3.forEach(r => console.log(`   "${r.Name}" @ ${r.Account?.Name || '?'}`));

console.log('\n=== Test 4 : token fixe (sans particule "d") ===');
const sosl4 = `FIND {${escapeSosl(toSoslTokensFixed(CURLY))}} IN ALL FIELDS RETURNING Contact(${CONTACT_FIELDS} LIMIT 10)`;
console.log('SOSL:', sosl4);
const r4 = await soslSearch(sosl4);
console.log(`-> ${r4.length} resultat(s)`);
r4.forEach(r => console.log(`   "${r.Name}" @ ${r.Account?.Name || '?'}`));

console.log('\n=== Test 5 : normalizeApo matching ===');
const sfOrgeval = r3.filter(r => r.Name?.toLowerCase().includes('orgeval'));
for (const r of sfOrgeval) {
  const sfName = r.Name;
  console.log(`\nSF name : "${sfName}"`);
  for (const [label, article] of [['U+0027', STRAIGHT], ['U+2019', CURLY]]) {
    const a_old = normalizeApoCurrent(stripAcc(nfc(article)).toLowerCase());
    const b     = normalizeApoFixed(stripAcc(nfc(sfName)).toLowerCase());
    const a_fix = normalizeApoFixed(stripAcc(nfc(article)).toLowerCase());
    const b_old = normalizeApoCurrent(stripAcc(nfc(sfName)).toLowerCase());
    console.log(`  ${label} — actuel  : article="${a_old}" | sf="${b_old}" | match=${b_old.includes(a_old) || a_old.includes(b_old) ? 'OK' : 'FAIL'}`);
    console.log(`  ${label} — fixe    : article="${a_fix}" | sf="${b}"    | match=${b.includes(a_fix) || a_fix.includes(b) ? 'OK' : 'FAIL'}`);
  }
}
