// node --env-file=.env test-accounts.js [query]
import { soqlQuery, soslSearch, escapeSoql } from './lib/salesforce.js';

const q = process.argv[2] || 'Groupe Sigma Gestion';

// 1. SOSL sur les accounts
const sosl = `FIND {${q}*} IN NAME FIELDS RETURNING Account(Id, Name, ParentId, Parent.Name LIMIT 20)`;
console.log('\nSOSL:', sosl);
const records = await soslSearch(sosl);

console.log(`\n${records.length} comptes trouvés pour "${q}" :\n`);

const withParent    = records.filter(r => r.ParentId);
const withoutParent = records.filter(r => !r.ParentId);

console.log(`  Sans parent (groupes) : ${withoutParent.length}`);
withoutParent.forEach(r => console.log(`    • ${r.Name}  [${r.Id}]`));

console.log(`\n  Avec parent (filiales) : ${withParent.length}`);
withParent.forEach(r => console.log(`    • ${r.Name}  → parent: ${r.Parent?.Name || r.ParentId}  [${r.Id}]`));
