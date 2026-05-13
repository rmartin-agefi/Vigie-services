const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
const SF_API_VERSION = 'v59.0';

// Champs retournés par les deux routes SF
const CONTACT_FIELDS = [
  'Id', 'FirstName', 'LastName', 'Name', 'Salutation',
  'Titre_exact_op__c', 'Email', 'Phone', 'MobilePhone',
  'Account.Name', 'Account.Id', 'OwnerId', 'Owner.Name',
  'commercial_referent__c', 'LastActivityDate',
  'lien_linkedin_indiv__c', 'lien_twitter_indiv__c', 'lien_facebook_indiv__c',
  'Photo_url__c', 'Fonction_Niveau_1__c', 'Fonction_Niveau_2__c',
  'Etat__c', 'Source__c', 'Nb_Mandats__c', 'NB_Postes__c', 'Pictos_contact__c',
  'Parcours_professionnel__c',
].join(', ');

// Cache du token OAuth2
let _token = null;
let _instanceUrl = null;
let _tokenExpiresAt = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiresAt) return _token;

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
  });

  const res = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Salesforce auth error ${res.status}: ${err}`);
  }

  const data = await res.json();
  _token = data.access_token;
  _instanceUrl = data.instance_url;
  console.log('[salesforce] instance_url:', _instanceUrl);
  // Token SF valide ~2h, on renouvelle après 110 min
  _tokenExpiresAt = Date.now() + 110 * 60 * 1000;
  return _token;
}

/**
 * Exécute une requête SOQL et retourne les records.
 * Échappe les guillemets simples pour éviter l'injection SOQL.
 */
export async function soqlQuery(soql) {
  const token = await getToken();
  const url = `${_instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    // Token expiré — forcer le renouvellement
    _token = null;
    return soqlQuery(soql);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Salesforce query error ${res.status}: ${err}`);
  }

  const data = await res.json();
  console.log('[salesforce] query response — totalSize:', data.totalSize, '| records:', data.records?.length ?? 0);
  return data.records ?? [];
}

/** Échappe les guillemets simples dans une valeur SOQL */
export function escapeSoql(value) {
  return String(value).replace(/'/g, "\\'");
}

/** Échappe les caractères spéciaux SOSL */
export function escapeSosl(value) {
  return String(value)
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
    .replace(/\?/g, '\\?').replace(/&/g, '\\&').replace(/\|/g, '\\|')
    .replace(/!/g, '\\!').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
    .replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)').replace(/\^/g, '\\^').replace(/~/g, '\\~')
    .replace(/\*/g, '\\*').replace(/:/g, '\\:').replace(/\+/g, '\\+')
    .replace(/-/g, '\\-');
}

/**
 * Exécute une recherche SOSL et retourne les searchRecords.
 */
export async function soslSearch(sosl) {
  const token = await getToken();
  const url = `${_instanceUrl}/services/data/${SF_API_VERSION}/search/?q=${encodeURIComponent(sosl)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    _token = null;
    return soslSearch(sosl);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Salesforce SOSL error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.searchRecords ?? [];
}

/**
 * Retourne l'Id SF d'un User actif à partir de son email.
 * Retourne null si non trouvé.
 */
export async function getUserIdByEmail(email) {
  if (!email) return null;
  const rows = await soqlQuery(
    `SELECT Id FROM User WHERE Email = '${escapeSoql(email)}' AND IsActive = true LIMIT 1`
  );
  return rows[0]?.Id || null;
}

/**
 * Crée un enregistrement Salesforce via REST API.
 * Retourne { id, success } ou lance une erreur.
 */
export async function createRecord(sobjectType, fields) {
  const token = await getToken();
  const url   = `${_instanceUrl}/services/data/${SF_API_VERSION}/sobjects/${sobjectType}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(fields),
  });

  if (res.status === 401) { _token = null; return createRecord(sobjectType, fields); }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Salesforce create ${sobjectType} ${res.status}: ${err}`);
  }

  return res.json(); // { id, success, errors }
}

/**
 * Met à jour un enregistrement Salesforce via REST API (PATCH).
 * SF retourne 204 sans corps en cas de succès.
 */
export async function updateRecord(sobjectType, recordId, fields) {
  const token = await getToken();
  const url   = `${_instanceUrl}/services/data/${SF_API_VERSION}/sobjects/${sobjectType}/${recordId}`;

  const res = await fetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(fields),
  });

  if (res.status === 401) { _token = null; return updateRecord(sobjectType, recordId, fields); }
  if (res.status === 204) return { success: true };

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Salesforce update ${sobjectType}/${recordId} ${res.status}: ${err}`);
  }

  return { success: true };
}

export { CONTACT_FIELDS };
