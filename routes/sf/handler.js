import { Router } from 'express';
import { soslSearch, soqlQuery, escapeSosl, escapeSoql, createRecord, updateRecord, getUserIdByEmail } from '../../lib/salesforce.js';
import { requirePermission } from '../../middleware/permissions.js';

const router = Router();
const SF_DRY_RUN = process.env.SF_DRY_RUN === 'true';

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

// GET /webhook/sf/accounts?q=...&limit=15&includeEtats=1,9&includeOther=1 — autocomplete comptes
router.get('/accounts', async (req, res) => {
  const q     = (req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 200);
  if (q.length < 2) return res.json([]);

  // Filtrage optionnel par etat (demandé quand tous les filtres ne sont pas actifs)
  const KNOWN_ETATS  = ['1', '9', '7'];
  const includeEtats = (req.query.includeEtats || '').split(',').map(e => e.trim()).filter(e => KNOWN_ETATS.includes(e));
  const includeOther = req.query.includeOther === '1';
  // Si aucun param n'est fourni → pas de filtre (comportement par défaut, tous les etats)
  const hasFilter    = req.query.includeEtats !== undefined || req.query.includeOther !== undefined;

  if (hasFilter && !includeEtats.length && !includeOther) return res.json([]);

  let etatWhere = '';
  if (hasFilter) {
    const parts = [];
    if (includeEtats.length) parts.push(`Etat__c IN (${includeEtats.map(e => `'${e}'`).join(',')})`);
    if (includeOther)         parts.push(`Etat__c NOT IN ('1','9','7')`);
    if (parts.length === 1)   etatWhere = ` WHERE ${parts[0]}`;
    else if (parts.length > 1) etatWhere = ` WHERE (${parts.join(' OR ')})`;
  }

  const normalized = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const term = escapeSosl(normalized);
  const sosl = `FIND {${term}*} IN NAME FIELDS RETURNING Account(Id, Name, ParentId, Parent.Name, Etat__c${etatWhere} LIMIT ${limit})`;

  try {
    const records = await soslSearch(sosl);
    const results = records.map(r => ({
      id:         r.Id,
      name:       r.Name,
      parentId:   r.ParentId      || null,
      parentName: r.Parent?.Name  || null,
      etat:       r.Etat__c       || null,
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

// POST /webhook/sf/create — création Account ou Contact
router.post('/create', requirePermission('eh', 'alpha'), async (req, res) => {
  const { type, name, sector, billingCity, billingCountry, etat, ownerEmail, referentEmail } = req.body;
  console.log('[sf/create] type:', type, '| name:', name, '| owner:', ownerEmail);

  if (!name?.trim()) {
    return res.status(400).json({ success: false, error: 'Le nom est obligatoire' });
  }

  try {
    if (type === 'account') {
      const [ownerId, referentId] = await Promise.all([
        getUserIdByEmail(ownerEmail),
        getUserIdByEmail(referentEmail),
      ]);

      if (ownerEmail && !ownerId) {
        console.warn('[sf/create] OwnerId non trouvé pour:', ownerEmail);
      }

      const fields = {
        Name: name.trim(),
        ...(sector         && { Secteur_activite_principal__c:       sector }),
        ...(billingCity    && { BillingCity:                         billingCity }),
        ...(billingCountry && { BillingCountry:                      billingCountry }),
        ...(etat           && { Etat__c:                             etat }),
        ...(ownerId        && { OwnerId:                             ownerId }),
        ...(referentId     && { R_f_ren_commercial_abonnements__c:   referentId }),
      };

      console.log('[sf/create] Account fields:', JSON.stringify(fields));
      if (SF_DRY_RUN) {
        console.log('[sf/create] 🧪 DRY RUN — aucune création Salesforce');
        return res.json({ success: true, accountId: 'DRY_RUN_' + Date.now() });
      }
      const result = await createRecord('Account', fields);
      console.log('[sf/create] Account créé:', result.id);
      return res.json({ success: true, accountId: result.id });

    } else {
      return res.status(501).json({ success: false, error: 'Création contact non encore implémentée' });
    }
  } catch (err) {
    console.error('[sf/create] Erreur:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhook/sf/update — mise à jour Account ou Contact
router.post('/update', requirePermission('eh', 'alpha'), async (req, res) => {
  const { salesforceId, type, name, sector, billingCity, billingCountry, etat, ownerEmail, referentEmail } = req.body;
  console.log('[sf/update] type:', type, '| id:', salesforceId);

  if (!salesforceId) {
    return res.status(400).json({ success: false, error: 'salesforceId est obligatoire' });
  }

  try {
    if (type === 'Account') {
      const referentId = await getUserIdByEmail(referentEmail);

      const fields = {
        ...(name           && { Name:                                name.trim() }),
        ...(sector         && { Secteur_activite_principal__c:       sector }),
        ...(billingCity    && { BillingCity:                         billingCity }),
        ...(billingCountry && { BillingCountry:                      billingCountry }),
        ...(etat           && { Etat__c:                             etat }),
        ...(referentId     && { R_f_ren_commercial_abonnements__c:   referentId }),
      };

      console.log('[sf/update] Account fields:', JSON.stringify(fields));
      await updateRecord('Account', salesforceId, fields);
      return res.json({ success: true });

    } else {
      return res.status(501).json({ success: false, error: 'Mise à jour contact non encore implémentée' });
    }
  } catch (err) {
    console.error('[sf/update] Erreur:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
