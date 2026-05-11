// test-compte-sans-poste.js — node --env-file=.env test-compte-sans-poste.js
import { soqlQuery } from './lib/salesforce.js';

const records = await soqlQuery(`SELECT Id, Name, Etat__c FROM Account WHERE Name = 'Compte pour contact sans poste' LIMIT 5`);

if (!records.length) {
  console.log('Aucun compte trouvé.');
} else {
  records.forEach(r => {
    console.log(`Id    : ${r.Id}`);
    console.log(`Nom   : ${r.Name}`);
    console.log(`État  : ${r.Etat__c}`);
    console.log('---');
  });
  console.log(`\n→ À hardcoder : const COMPTE_SANS_POSTE_ID = '${records[0].Id}';`);
}
