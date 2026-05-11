import { Router } from 'express';
import { soslSearch, soqlQuery, escapeSosl, escapeSoql } from '../../lib/salesforce.js';

const router = Router();

const CONTACT_FETCH_FIELDS = [
  'Id', 'Salutation', 'FirstName', 'MiddleName', 'LastName',
  'Titre_exact_op__c',
  'Phone', 'MobilePhone', 'Email',
  'lien_linkedin_indiv__c',
  'Nom_de_l_assistant_e__c', 'T_l_phone_de_l_assistant_e__c', 'Email_de_l_assistant_e__c',
  'AccountId', 'Account.Name',
  'commercial_referent__c', 'commercial_referent__r.Name',
].join(', ');

const ACCOUNT_FETCH_FIELDS = [
  'Id', 'Name', 'BillingCountry', 'BillingCity',
  'Secteur_activite_principal__c', 'Etat__c',
  'OwnerId', 'Owner.Name',
  'R_f_ren_commercial_abonnements__c', 'R_f_ren_commercial_abonnements__r.Name',
].join(', ');

// GET /webhook/sf/accounts?q=... — autocomplete comptes
router.get('/accounts', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const normalized = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const term = escapeSosl(normalized);
  const sosl = `FIND {${term}*} IN NAME FIELDS RETURNING Account(Id, Name, ParentId, Parent.Name, Etat__c LIMIT 15)`;

  try {
    const records = await soslSearch(sosl);
    const results = records.map(r => ({
      id:         r.Id,
      name:       r.Name,
      parentName: r.Parent?.Name || null,
      etat:       r.Etat__c     || null,
    }));
    return res.json(results);
  } catch (err) {
    console.error('[sf/accounts] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /webhook/sf/contact/:id — fiche Contact complète
router.get('/contact/:id', async (req, res) => {
  const id = escapeSoql(req.params.id);
  console.log('[sf/contact] fetch id:', id);
  try {
    const rows = await soqlQuery(
      `SELECT ${CONTACT_FETCH_FIELDS} FROM Contact WHERE Id = '${id}' LIMIT 1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Contact non trouvé' });
    const r = rows[0];
    console.log('[sf/contact] OK:', r.FirstName, r.LastName, '| Compte:', r.Account?.Name, '| Référent:', r['commercial_referent__r']?.Name);
    return res.json({
      id:             r.Id,
      salutation:     r.Salutation   || '',
      firstName:      r.FirstName    || '',
      middleName:     r.MiddleName   || '',
      lastName:       r.LastName     || '',
      title:          r.Titre_exact_op__c || '',
      phone:          r.Phone        || '',
      mobile:         r.MobilePhone  || '',
      email:          r.Email        || '',
      linkedIn:       r.lien_linkedin_indiv__c || '',
      assistantName:  r.Nom_de_l_assistant_e__c || '',
      assistantPhone: r.T_l_phone_de_l_assistant_e__c || '',
      assistantEmail: r.Email_de_l_assistant_e__c || '',
      accountId:      r.AccountId    || '',
      accountName:    r.Account?.Name || '',
      referentName:   r['commercial_referent__r']?.Name || '',
    });
  } catch (err) {
    console.error('[sf/contact] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /webhook/sf/account/:id — fiche Account complète
router.get('/account/:id', async (req, res) => {
  const id = escapeSoql(req.params.id);
  console.log('[sf/account] fetch id:', id);
  try {
    const rows = await soqlQuery(
      `SELECT ${ACCOUNT_FETCH_FIELDS} FROM Account WHERE Id = '${id}' LIMIT 1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte non trouvé' });
    const r = rows[0];
    console.log('[sf/account] OK:', r.Name, '| Etat:', r.Etat__c, '| Owner:', r.Owner?.Name, '| Référent abo:', r['R_f_ren_commercial_abonnements__r']?.Name);
    return res.json({
      id:                    r.Id,
      name:                  r.Name     || '',
      city:                  r.BillingCity    || '',
      country:               r.BillingCountry || '',
      sector:                r.Secteur_activite_principal__c || '',
      etat:                  r.Etat__c  || '',
      ownerName:             r.Owner?.Name || '',
      referentAbonnementName: r['R_f_ren_commercial_abonnements__r']?.Name || '',
    });
  } catch (err) {
    console.error('[sf/account] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /webhook/sf/create — à implémenter (étape suivante)
router.post('/create', async (req, res) => {
  console.log('[sf/create] payload reçu:', JSON.stringify(req.body));
  return res.status(501).json({ error: 'Non implémenté' });
});

// POST /webhook/sf/update — à implémenter (étape suivante)
router.post('/update', async (req, res) => {
  console.log('[sf/update] payload reçu:', JSON.stringify(req.body));
  return res.status(501).json({ error: 'Non implémenté' });
});

export default router;
