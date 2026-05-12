// test-sosl-faustine.js — node --env-file=.env test-sosl-faustine.js
// Teste exactement la requête SOSL du handler entity-highlighter pour Faustine Fleuret
// Simule un article avec plusieurs personnes pour voir si la limite 50 tronque

import { soslSearch, escapeSosl, CONTACT_FIELDS } from './lib/salesforce.js';

const nfc          = s => s.normalize('NFC');
const stripAcc     = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizeApo = s => s.replace(/\s*['']\s*/g, ' ').replace(/\s+/g, ' ').trim();

function toSoslTokens(name) {
  return stripAcc(nfc(name)).toLowerCase().replace(/-/g, ' ').trim();
}

// Simule un article riche avec Faustine Fleuret + plusieurs autres personnes
// (pour voir si le LIMIT 50 global les tronque)
const PERSONS_SPARSE  = ['Faustine Fleuret'];
const PERSONS_ARTICLE = [
  'Faustine Fleuret',
  'Jean Dupont', 'Marie Martin', 'Pierre Bernard', 'Sophie Leroy',
  'François Moreau', 'Isabelle Simon', 'Nicolas Lefebvre', 'Camille Girard',
  'Antoine Roux', 'Julie Bonnet', 'Thomas Fournier', 'Céline Garnier',
  'Maxime Morin', 'Laura Rousseau',
];

function buildSosl(persons) {
  const terms = persons.slice(0, 20)
    .map(n => escapeSosl(toSoslTokens(n)))
    .join(' OR ');
  return `FIND {${terms}} IN NAME FIELDS RETURNING Contact(${CONTACT_FIELDS}) LIMIT 50`;
}

async function run() {
  console.log('=== TEST 0 : Chercher uniquement par nom de famille {fleuret} ===');
  const r0 = await soslSearch(`FIND {fleuret} IN NAME FIELDS RETURNING Contact(Id, Name, Email, Account.Name)`);
  console.log(`→ ${r0.length} résultat(s)`);
  r0.forEach(c => console.log(`  - ${c.Name} | ${c.Account?.Name || '(pas de compte)'} | ${c.Email || ''}`));

  console.log('\n=== TEST 0b : {faustine} seul ===');
  const r0b = await soslSearch(`FIND {faustine} IN NAME FIELDS RETURNING Contact(Id, Name, Email, Account.Name)`);
  console.log(`→ ${r0b.length} résultat(s)`);
  r0b.forEach(c => console.log(`  - ${c.Name} | ${c.Account?.Name || '(pas de compte)'} | ${c.Email || ''}`));

  console.log('\n=== TEST 0c : {fleuret} avec Lead aussi ===');
  const r0c = await soslSearch(`FIND {fleuret} IN NAME FIELDS RETURNING Contact(Id, Name, Email, Account.Name LIMIT 20), Lead(Id, Name, Email, Company LIMIT 10)`);
  console.log(`→ ${r0c.length} résultat(s)`);
  r0c.forEach(c => console.log(`  - [${c.attributes?.type}] ${c.Name} | ${c.Account?.Name || c.Company || '(pas de compte)'} | ${c.Email || ''}`));

  console.log('\n=== TEST 1 : Faustine Fleuret seule ===');
  const sosl1 = buildSosl(PERSONS_SPARSE);
  console.log('SOSL:', sosl1);
  const r1 = await soslSearch(sosl1);
  console.log(`→ ${r1.length} résultat(s)`);
  r1.forEach(c => console.log(`  - ${c.Name} | ${c.Account?.Name || '(pas de compte)'} | ${c.Email || ''}`));

  console.log('\n=== TEST 2 : Article complet (15 personnes) ===');
  const sosl2 = buildSosl(PERSONS_ARTICLE);
  console.log('SOSL (début):', sosl2.substring(0, 200) + '...');
  const r2 = await soslSearch(sosl2);
  console.log(`→ ${r2.length} résultat(s) au total`);
  const faustines = r2.filter(c => normalizeApo(stripAcc(nfc(c.Name)).toLowerCase()).includes('faustine fleuret'));
  console.log(`→ Faustine Fleuret dans les résultats : ${faustines.length}`);
  faustines.forEach(c => console.log(`  - ${c.Name} | ${c.Account?.Name || '(pas de compte)'} | ${c.Email || ''}`));

  console.log('\n=== TEST 3 : Idem sans LIMIT global (LIMIT dans RETURNING) ===');
  const sosl3 = `FIND {${PERSONS_ARTICLE.slice(0, 20).map(n => escapeSosl(toSoslTokens(n))).join(' OR ')}} IN NAME FIELDS RETURNING Contact(${CONTACT_FIELDS} LIMIT 50)`;
  const r3 = await soslSearch(sosl3);
  console.log(`→ ${r3.length} résultat(s) au total`);
  const faustines3 = r3.filter(c => normalizeApo(stripAcc(nfc(c.Name)).toLowerCase()).includes('faustine fleuret'));
  console.log(`→ Faustine Fleuret dans les résultats : ${faustines3.length}`);
  faustines3.forEach(c => console.log(`  - ${c.Name} | ${c.Account?.Name || '(pas de compte)'} | ${c.Email || ''}`));
}

run().catch(console.error);
