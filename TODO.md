# TODO — influence-services

## Architecture

- [x] Créer le projet Node.js 22, Express.js, ESM (pas de TypeScript, pas de build tool)
- [x] Auto-chargement des routes : `server.js` scanne `routes/*/handler.js` → monte `/webhook/<nom>`
- [x] Endpoint `/health` (non authentifié)
- [x] Endpoint `POST /admin/refresh` protégé par header `x-admin-token`
- [x] Dockerfile pour Cloud Run
- [x] `.env.example` avec toutes les variables requises

## Authentification

- [x] Middleware `middleware/auth.js` appliqué sur toutes les routes `/webhook/*`
- [x] Bypass `AUTH_REQUIRED=false` pour le développement local
- [x] Validation via Microsoft Graph `/me` (tokens Graph émis par `chrome.identity`)
- [x] Cache token en mémoire 5 minutes (évite un appel Graph à chaque requête)
- [x] Blocage 401 sans token, 401 avec token invalide, 403 si email non autorisé (`ALLOWED_EMAILS`)

## Routes migrées (depuis n8n)

- [x] `POST /webhook/entity-highlighter` — extraction entités GPT-4.1-mini + lookup SOSL Salesforce contacts + comptes
- [x] `POST /webhook/entity-highlighter-create` — création contact Salesforce depuis l'extension
- [x] `GET  /webhook/salesforce-search` — recherche contact SF par nom (SOQL)
- [x] `GET  /webhook/salesforce-search-link` — recherche contact SF par URL LinkedIn (SOQL)
- [x] `POST /webhook/check-position` — vérification poste LinkedIn vs Salesforce via GPT-4.1-mini
- [x] `POST /webhook/linkedin-summary` — génération fiche synthétique LinkedIn via GPT-4o-mini
- [x] `GET  /webhook/surfe-search` — enrichissement email via Surfe (POST enrich → poll callback)
- [x] `GET  /webhook/piano-check-agefi` — vérification abonnements Piano L'Agefi
- [x] `GET  /webhook/piano-check-opinion` — vérification abonnements Piano L'Opinion

## Librairies partagées (`lib/`)

- [x] `lib/salesforce.js` — OAuth2 client_credentials, token cache 110min, `soqlQuery()`, `soslSearch()`, `escapeSoql()`, `escapeSosl()`, `CONTACT_FIELDS`
- [x] `lib/gcs.js` — cache GCS 5min, `getPrompt(key)`, `getData(key)`, `refreshAll()`, fallback fichiers locaux en dev
- [x] `lib/openai.js` — helper `callChat()` avec fetch natif (pas de SDK)
- [x] `lib/piano.js` — `checkPianoAccess()` partagé par les deux routes Piano

## Prompts GCS

- [x] Stocker les 4 prompts dans le bucket GCS `prompts-ext`
- [x] `PROMPT_KEY_MAP` pour mapper clé logique → chemin GCS exact
- [x] Prompt `entity-highlighter` réutilisé pour `alpha-reader` (source différente, même prompt)
- [x] Cache en mémoire 5 minutes, vidé via `POST /admin/refresh`

## Déploiement

- [x] `infra/cloudbuild.yaml` — CI/CD Cloud Build (build image Docker → push Artifact Registry → deploy Cloud Run)
- [x] Déploiement sur Cloud Run `europe-west9`, projet `influence-beymedias`
- [x] Auto-déploiement à chaque `git push` via trigger Cloud Build
- [x] URL production : `https://vigie-services-253893378410.europe-west9.run.app`
