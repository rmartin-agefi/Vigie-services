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
├── server.js              ← Point d'entrée. Auto-charge routes/*/handler.js
├── middleware/
│   └── auth.js            ← Azure AD JWT (TODO #7). Bypass si AUTH_REQUIRED=false
├── lib/
│   └── gcs.js             ← Cache GCS 5 min : getPrompt(key), getData(key), refreshAll()
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
3. Le serveur monte automatiquement `/webhook/<nom-webhook>` — même chemin qu'en n8n

## Prompts GCS

Les prompts sont stockés dans `gs://<GCS_BUCKET>/influence-services/prompts/<key>.txt`.
Les data JSON dans `gs://<GCS_BUCKET>/influence-services/data/<key>.json`.

- Éditer localement dans `prompts/` ou `data/`, puis `sync-prompts.sh`
- `getPrompt(key)` retourne `null` si absent — le handler doit retourner `500`
- Cache 5 min en mémoire, `POST /admin/refresh` pour vider immédiatement

**Règle absolue : jamais de prompt inline dans le code. Toujours via GCS.**

## Auth

- En dev : `AUTH_REQUIRED=false` dans `.env` (ou `npm run dev` le fait automatiquement)
- En prod : validation JWT Azure AD — TODO #7
- `POST /admin/refresh` protégé par `x-admin-token` header

## Variables d'environnement

Voir `.env.example`. Copier en `.env`, ne jamais committer.

## Workflows migrés

| Route | Statut | Utilisé dans l'extension |
|-------|--------|--------------------------|
| `/webhook/surfe-search` | 🔲 TODO | `linkedin/injector.js` |
| `/webhook/check-position` | 🔲 TODO | `linkedin/injector.js` |
| `/webhook/linkedin-summary` | 🔲 TODO | `linkedin/content.js` |
| `/webhook/salesforce-search` | 🔲 TODO | `linkedin/api.js` |
| `/webhook/salesforce-search-link` | 🔲 TODO | `linkedin/api.js` |
| `/webhook/entity-highlighter` | 🔲 TODO | `eh/api.js`, `alpha-reader/viewer.js` |
| `/webhook/entity-highlighter-create` | 🔲 TODO | `eh/api.js` |
| `/webhook/piano-check-agefi` | 🔲 TODO | `linkedin/api.js` |
| `/webhook/piano-check-opinion` | 🔲 TODO | `linkedin/api.js` |
