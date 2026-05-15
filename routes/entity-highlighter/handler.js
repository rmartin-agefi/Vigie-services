import { Router } from 'express';
import { getPrompt } from '../../lib/gcs.js';
import { callAI } from '../../lib/ai.js';
import { soslSearch, escapeSosl, CONTACT_FIELDS } from '../../lib/salesforce.js';

const router = Router();

const CONTACT_SOSL_FIELDS = CONTACT_FIELDS;
const ACCOUNT_SOSL_FIELDS = 'Id, Name, Website, Industry, Description, Ownership, Pictos_compte__c, OwnerId, Owner.Name, Sigle__c, Raison_sociale__c';

const nfc          = s => s.normalize('NFC');
const stripAcc     = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// Normalise espaces autour des apostrophes : "d' Hauteville" → "d Hauteville"
const normalizeApo = s => s.replace(/\s*['']\s*/g, ' ').replace(/\s+/g, ' ').trim();

// Unquoted SOSL token search: accent-strip + lowercase + hyphens→spaces
// Résout les noms accentués (ë, é, ...) et composés (Ziouar-Cornec)
function toSoslTokens(name) {
  return stripAcc(nfc(name)).toLowerCase().replace(/-/g, ' ').trim();
}

// Une seule requête SOSL IN ALL FIELDS : couvre Name, Sigle__c, Raison_sociale__c
// Contact + Account dans le même FIND — séparation faite côté mapping (persons vs organizations)
function buildCombinedSosl(persons, organizations) {
  const terms = [
    ...persons.slice(0, 15).map(name => escapeSosl(toSoslTokens(name))),
    ...organizations.slice(0, 15).map(name => escapeSosl(toSoslTokens(name))),
  ].filter(Boolean).join(' OR ');
  return `FIND {${terms}} IN ALL FIELDS RETURNING Contact(${CONTACT_SOSL_FIELDS} LIMIT 50), Account(${ACCOUNT_SOSL_FIELDS} LIMIT 200)`;
}

function mapContacts(sfContacts, personNames) {
  const result = {};
  for (const contact of sfContacts) {
    if (!contact.Name) continue;
    const matched = personNames.find(name => {
      const a = normalizeApo(stripAcc(nfc(name)).toLowerCase()), b = normalizeApo(stripAcc(nfc(contact.Name)).toLowerCase());
      return b.includes(a) || a.includes(b);
    });
    if (!matched) continue;
    if (!result[matched]) result[matched] = [];
    result[matched].push({
      id:            contact.Id,
      salutation:    contact.Salutation         || '',
      firstName:     contact.FirstName          || '',
      lastName:      contact.LastName           || '',
      fullName:      contact.Name,
      title:         contact.Titre_exact_op__c  || '',
      functionLevel1: contact.Fonction_Niveau_1__c || '',
      functionLevel2: contact.Fonction_Niveau_2__c || '',
      email:         contact.Email              || '',
      phone:         contact.Phone || contact.MobilePhone || '',
      mobile:        contact.MobilePhone        || '',
      company:       contact.Account?.Name      || '',
      companyId:     contact.Account?.Id        || null,
      owner:         contact.Owner?.Name        || '',
      ownerId:       contact.OwnerId,
      referentId:    contact.commercial_referent__c || null,
      lastActivity:  contact.LastActivityDate,
      linkedIn:      contact.lien_linkedin_indiv__c  || null,
      twitter:       contact.lien_twitter_indiv__c   || null,
      facebook:      contact.lien_facebook_indiv__c  || null,
      photoUrl:      contact.Photo_url__c        || null,
      status:        contact.Etat__c             || 'Contact',
      source:        contact.Source__c           || '',
      nbMandats:     contact.Nb_Mandats__c       || 0,
      nbPostes:      contact.NB_Postes__c        || 0,
      pictos:        contact.Pictos_contact__c   || '',
      parcours:      contact.Parcours_professionnel__c || '',
    });
  }
  return result;
}

function _accountToRecord(account) {
  return {
    id:          account.Id,
    name:        account.Name,
    website:     account.Website     || '',
    industry:    account.Industry    || '',
    description: account.Description || '',
    ownership:   account.Ownership   || '',
    pictos:      account.Pictos_compte__c || '',
    owner:       account.Owner?.Name || '',
    ownerId:     account.OwnerId,
  };
}

function mapAccounts(sfAccounts, orgNames) {
  const result = {};
  for (const account of sfAccounts) {
    if (!account.Name) continue;
    const matched = orgNames.find(name => {
      const a = normalizeApo(stripAcc(nfc(name)).toLowerCase()), b = normalizeApo(stripAcc(nfc(account.Name)).toLowerCase());
      return b.includes(a) || a.includes(b);
    });
    if (!matched) continue;
    if (!result[matched]) result[matched] = [];
    if (result[matched].length >= 20) continue;
    result[matched].push(_accountToRecord(account));
  }
  return result;
}

// Mappe les résultats SOQL (match via Sigle__c ou Raison_sociale__c)
function mapAccountsAlt(sfAccounts, orgNames) {
  const result = {};
  for (const account of sfAccounts) {
    const sigle  = account.Sigle__c          || '';
    const raison = account.Raison_sociale__c  || '';
    const matched = orgNames.find(name => {
      const n = normalizeApo(stripAcc(nfc(name)).toLowerCase());
      if (sigle  && normalizeApo(stripAcc(nfc(sigle)).toLowerCase())  === n) return true;
      if (raison && normalizeApo(stripAcc(nfc(raison)).toLowerCase()) === n) return true;
      return false;
    });
    if (!matched) continue;
    if (!result[matched]) result[matched] = [];
    if (result[matched].length >= 20) continue;
    result[matched].push(_accountToRecord(account));
  }
  return result;
}

// POST /webhook/entity-highlighter
// Body: { text }
router.post('/', async (req, res) => {
  const { text, source } = req.body ?? {};
  if (!text) return res.status(400).json({ error: 'text requis' });

  // 'alpha' → prompt PDF-highlighter (GCS séparé), sinon → entity-highlighter
  const promptKey = source === 'alpha' ? 'alpha-reader' : 'entity-highlighter';
  const promptTemplate = await getPrompt(promptKey);
  if (!promptTemplate) return res.status(500).json({ error: 'Prompt introuvable (GCS)' });

  // 1. Extraction des entités via OpenAI
  let persons = [], organizations = [];
  try {
    const prompt = promptTemplate.replace('{{text}}', text);
    const endpointKey = source === 'alpha' ? 'vigie.alpha-reader' : 'vigie.entity-highlighter';
    const raw = await callAI(endpointKey, prompt, { temperature: 0 });
    const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(clean);
    persons       = parsed.persons       ?? [];
    organizations = parsed.organizations ?? [];
  } catch (err) {
    console.error('[entity-highlighter] OpenAI error:', err.message);
    return res.status(502).json({ error: 'Erreur extraction entités' });
  }

  const entities = [
    ...persons.map(name => ({ text: name, type: 'person' })),
    ...organizations.map(name => ({ text: name, type: 'organization' })),
  ];

  // 2. Recherche SF : une seule requête SOSL IN ALL FIELDS (Contact + Account)
  let sfContacts = [], sfAccounts = [];
  if (persons.length > 0 || organizations.length > 0) {
    try {
      const sosl = buildCombinedSosl(persons, organizations);
      console.log('[entity-highlighter] SOSL query:', sosl);
      const records = await soslSearch(sosl);
      sfContacts = records.filter(r => r.attributes?.type === 'Contact');
      sfAccounts = records.filter(r => r.attributes?.type === 'Account');
      console.log('[entity-highlighter] contacts:', sfContacts.length, '| accounts:', sfAccounts.length, sfAccounts.map(a => a.Name));
    } catch (err) {
      console.error('[entity-highlighter] SOSL error:', err.message);
    }
  }

  // 3. Mapping Name (mapAccounts) + Sigle/Raison_sociale (mapAccountsAlt), dédup par Id
  const salesforce = mapContacts(sfContacts, persons);
  const mapByName  = mapAccounts(sfAccounts, organizations);
  const mapByAlt   = mapAccountsAlt(sfAccounts, organizations);

  const salesforceAccounts = {};
  const allOrgNames = new Set([...Object.keys(mapByName), ...Object.keys(mapByAlt)]);
  for (const orgName of allOrgNames) {
    const list = [...(mapByName[orgName] || [])];
    const seen = new Set(list.map(a => a.id));
    for (const a of mapByAlt[orgName] || []) {
      if (!seen.has(a.id)) { seen.add(a.id); list.push(a); }
    }
    salesforceAccounts[orgName] = list;
  }

  return res.json({
    success: true,
    entities,
    salesforce,
    salesforceAccounts,
    stats: {
      persons:                    persons.length,
      organizations:              organizations.length,
      salesforceMatches:          Object.keys(salesforce).length,
      salesforceAccountMatches:   Object.keys(salesforceAccounts).length,
    },
  });
});

export default router;
