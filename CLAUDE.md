# influence-services — Cloud Run backend

Migration des 9 webhooks n8n vers Cloud Run.
Express.js, Node 22, ESM vanilla JS, pas de TypeScript.

## Commandes

```bash
npm install
npm run dev    # AUTH_REQUIRED=false, hot-reload, pas besoin d'Azure AD
npm start      # Production (nécessite toutes les env vars)
```

Pour uploader les prompts/data vers GCS et rafraîchir le cache :
```bash
SERVICE_URL=https://... SERVICE_TOKEN=... ./infra/sync-prompts.sh
```

Pour déployer via Cloud Build :
```bash
gcloud builds submit --config infra/cloudbuild.yaml \
  --substitutions _REGION=europe-west9,_PROJECT_ID=influence-beymedias
```

## Architecture

```
influence-services/
├── server.js              ← Point d'entrée. Auto-charge routes/*/handler.js + applique permissions
├── middleware/
│   ├── auth.js            ← Azure AD (Graph /me, cache 5min). Bypass si AUTH_REQUIRED=false
│   └── permissions.js     ← requirePermission(moduleKey) — vérifie Firestore après auth
├── lib/
│   ├── gcs.js             ← Cache GCS 5 min : getPrompt(key), getData(key), refreshAll()
│   ├── firestore.js       ← Lecture permissions depuis Firestore REST, cache 5 min
│   ├── openai.js          ← callChat(prompt, options)
│   ├── salesforce.js      ← soslSearch(), CONTACT_FIELDS, escapeSosl()
│   └── piano.js           ← checkSubscription(email, media)
├── infra/
│   ├── cloudbuild.yaml    ← CI/CD Cloud Build
│   └── sync-prompts.sh    ← Upload prompts/data locaux → GCS + refresh cache
├── prompts/               ← Gitignored. Copies locales des prompts GCS (.txt)
├── data/                  ← Gitignored. Copies locales des data GCS (.json)
└── routes/
    └── <nom-webhook>/
        └── handler.js     ← Export default : Express Router
```

## Ajouter une nouvelle route

1. Créer `routes/<nom-webhook>/handler.js`
2. `export default router` (Express Router)
3. Ajouter une entrée dans `ROUTE_PERMISSIONS` dans `server.js` : `'nom-webhook': 'moduleKey'` (ou `null` si pas de check de module)
4. Le serveur monte automatiquement `/webhook/<nom-webhook>` au démarrage

## Prompts GCS

Les prompts sont stockés dans `gs://<GCS_BUCKET>/influence-services/prompts/<key>.txt`.
Les data JSON dans `gs://<GCS_BUCKET>/influence-services/data/<key>.json`.

- Éditer localement dans `prompts/` ou `data/`, puis `sync-prompts.sh`
- `getPrompt(key)` retourne `null` si absent — le handler doit retourner `500`
- Cache 5 min en mémoire, `POST /admin/refresh` pour vider immédiatement

**Règle absolue : jamais de prompt inline dans le code. Toujours via GCS.**

## Auth

- En dev : `AUTH_REQUIRED=false` dans `.env` (ou `npm run dev` le fait automatiquement)
- En prod : validation JWT Azure AD via JWKS Microsoft (tenant `2e1f24be-...`), fallback Graph /me, cache 5min
- `POST /admin/refresh` protégé par `x-admin-token` header

## Variables d'environnement

Voir `.env.example`. Copier en `.env`, ne jamais committer.

## Routes disponibles

| Route | Statut | Permission requise | Utilisé dans l'extension |
|-------|--------|--------------------|--------------------------|
| `/webhook/surfe-search` | ✅ OK | `linkedin` | `linkedin/injector.js` |
| `/webhook/check-position` | ✅ OK | `linkedin` | `linkedin/injector.js` |
| `/webhook/linkedin-summary` | ✅ OK | `linkedin` | `linkedin/content.js` |
| `/webhook/salesforce-search` | ✅ OK | `linkedin` | `linkedin/api.js` |
| `/webhook/salesforce-search-link` | ✅ OK | `linkedin` | `linkedin/api.js` |
| `/webhook/entity-highlighter` | ✅ OK | `eh` | `entity-highlighter/api.js`, `alpha-reader/viewer.js` |
| `/webhook/piano-check-agefi` | ✅ OK | `linkedin` | `linkedin/api.js` |
| `/webhook/piano-check-opinion` | ✅ OK | `linkedin` | `linkedin/api.js` |
| `/webhook/refresh-cache` | ✅ OK | — (auth only) | — |

N8N retiré — toutes les routes tournent sur Cloud Run.
