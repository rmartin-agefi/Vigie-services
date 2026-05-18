# influence-services — Cloud Run backend

Migration des 9 webhooks n8n vers Cloud Run.
Express.js, Node 22, ESM vanilla JS, pas de TypeScript.

## Commandes

```bash
npm install
npm run dev    # AUTH_REQUIRED=false, hot-reload, pas besoin d'Azure AD
npm start      # Production (nécessite toutes les env vars)
```

Pour uploader les prompts/data/config vers GCS et rafraîchir le cache :
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
│   ├── gcs.js             ← Cache GCS 5 min : getConfig(key), getPrompt(key), getData(key), refreshAll()
│   ├── ai.js              ← callAI(endpointKey, prompt, opts) — dispatcher multi-provider via config GCS
│   ├── firestore.js       ← Lecture permissions depuis Firestore REST, cache 5 min
│   ├── openai.js          ← (legacy) callChat direct — remplacé par ai.js, ne plus utiliser
│   ├── salesforce.js      ← soslSearch(), CONTACT_FIELDS, escapeSosl()
│   └── piano.js           ← checkSubscription(email, media)
├── infra/
│   ├── cloudbuild.yaml    ← CI/CD Cloud Build
│   └── sync-prompts.sh    ← Upload prompts/data/config locaux → GCS + refresh cache
├── prompts/               ← Gitignored. Copies locales des prompts GCS (.txt)
├── data/                  ← Gitignored. Copies locales des data GCS (.json)
├── config/                ← Gitignored. Copies locales des configs GCS (.json)
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

Les prompts sont stockés dans GCS sous `Extensions/Vigie/`.
Les data JSON dans `gs://<GCS_BUCKET>/Extensions/Vigie/data/<key>.json`.

Chemins GCS par clé logique (définis dans `lib/gcs.js`) :
| Clé | Chemin GCS |
|-----|-----------|
| `entity-highlighter` | `Extensions/Vigie/Entity-highlighter/prompts/entity-highlighter.txt` |
| `alpha-reader` | `Extensions/Vigie/PDF-highlighter/prompt/entity-highlighter.txt` |
| `check-position` | `Extensions/Vigie/Linkedin-enrich/prompt/check-position.txt` |
| `linkedin-summary` | `Extensions/Vigie/Linkedin-enrich/prompt/linkedin-summary.txt` |

- Éditer localement dans `prompts/` ou `data/`, puis `sync-prompts.sh`
- `getPrompt(key)` retourne `null` si absent — le handler doit retourner `500`
- Cache 5 min en mémoire, `POST /admin/refresh` pour vider immédiatement

**Règle absolue : jamais de prompt inline dans le code. Toujours via GCS.**

## Configuration des modèles IA

Les modèles utilisés par chaque endpoint sont configurables via deux fichiers GCS :

| Fichier GCS | Chemin | Rôle |
|-------------|--------|------|
| `models.json` | `Extensions/Vigie/config/models.json` | Registre des modèles disponibles (provider, tier, contextWindow…) |
| `endpoints.json` | `Extensions/Vigie/config/endpoints.json` | Mapping endpoint → clé modèle |

Copie locale dans `config/` (gitignorée). Structure de `endpoints.json` :
```json
{
  "vigie.entity-highlighter": "gpt-4.1-mini",
  "vigie.alpha-reader":       "gpt-4.1-mini",
  "vigie.check-position":     "gpt-4.1-mini",
  "vigie.linkedin-summary":   "gpt-4.1-mini"
}
```

**Pour changer le modèle d'un endpoint :** modifier `config/endpoints.json` → uploader dans GCS → le cache se vide en 5 min (ou immédiatement via `POST /admin/refresh`).

Les handlers appellent `callAI(endpointKey, prompt, opts)` depuis `lib/ai.js`. Ne plus utiliser `callChat` de `lib/openai.js`.

Providers supportés actuellement : `openai`. Les modèles `gemini` et `claude` sont dans le registre mais appellent `throw new Error('Provider non supporté')` tant que les branches ne sont pas implémentées dans `lib/ai.js`.

## Auth & Permissions

- En dev : `AUTH_REQUIRED=false` dans `.env` (ou `npm run dev` le fait automatiquement)
- En prod : validation JWT Azure AD via Graph `/me`, cache 5 min
- Après l'auth, `requirePermission(moduleKey)` vérifie Firestore — cache 5 min
- `ROUTE_PERMISSIONS` dans `server.js` mappe chaque route à son module. Valeur string (`'eh'`) ou tableau (`['eh', 'alpha']`) — tableau = logique **OR**
- Le cache Firestore est vidé par `POST /webhook/refresh-cache` (clic logo extension) ou `POST /admin/refresh` (admin token)
- `POST /admin/refresh` protégé par `x-admin-token` header

## Variables d'environnement

Voir `.env.example`. Copier en `.env`, ne jamais committer.

Variables ClickUp pour le bug reporter :
- `CLICKUP_API_KEY`, `CLICKUP_TEAM_ID`, `CLICKUP_PARENT_TASK_ID` — obligatoires
- `CLICKUP_ASSIGNEE_ID` — optionnel, ID numérique ClickUp. Si défini, chaque bug report est automatiquement assigné à cet utilisateur.

## Routes disponibles

| Route | Statut | Permission requise | Utilisé dans l'extension |
|-------|--------|--------------------|--------------------------|
| `/webhook/surfe-search` | ✅ OK | `linkedin` | `linkedin/injector.js` |
| `/webhook/check-position` | ✅ OK | `linkedin` | `linkedin/injector.js` |
| `/webhook/linkedin-summary` | ✅ OK | `linkedin` | `linkedin/content.js` |
| `/webhook/salesforce-search` | ✅ OK | `linkedin` | `linkedin/api.js` |
| `/webhook/entity-highlighter` | ✅ OK | `eh` **ou** `alpha` | `entity-highlighter/api.js`, `alpha-reader/viewer.js` |
| `/webhook/piano-check-agefi` | ✅ OK | `linkedin` | `linkedin/api.js` |
| `/webhook/piano-check-opinion` | ✅ OK | `linkedin` | `linkedin/api.js` |
| `/webhook/refresh-cache` | ✅ OK | — (auth only) | — |
| `/webhook/bug-reporter` | ✅ OK | — (auth only) | `modules/settings/panel-view.js` |

N8N retiré — toutes les routes tournent sur Cloud Run.
