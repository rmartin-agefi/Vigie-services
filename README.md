# influence-services

Backend Cloud Run de l'extension Chrome **Influence** (BeyMédias).

Remplace les 8 webhooks n8n par un service Express.js unifié, déployé sur Google Cloud Run. Chaque route est isolée dans son propre dossier et montée automatiquement au démarrage.

## Ce que fait ce service

| Route | Description |
|-------|-------------|
| `GET /webhook/surfe-search` | Enrichissement email via Surfe (async polling) |
| `POST /webhook/check-position` | Vérifie la cohérence poste LinkedIn ↔ Salesforce via GPT-4.1-mini |
| `POST /webhook/linkedin-summary` | Génère une fiche synthétique d'un profil LinkedIn via GPT-4o-mini |
| `GET /webhook/salesforce-search` | Recherche un contact Salesforce par nom (SOQL) |
| `GET /webhook/salesforce-search-link` | Recherche un contact Salesforce par URL LinkedIn (SOQL) |
| `POST /webhook/entity-highlighter` | Extrait les entités d'un texte (GPT-4.1-mini) et les recherche dans Salesforce (SOSL) |
| `GET /webhook/piano-check-agefi` | Vérifie les abonnements Piano d'un email sur L'Agefi |
| `GET /webhook/piano-check-opinion` | Vérifie les abonnements Piano d'un email sur L'Opinion |
| `GET /health` | Health check |
| `POST /admin/refresh` | Vide le cache GCS (protégé par `x-admin-token`) |

Les prompts LLM sont stockés dans GCS (`prompts-ext`) et mis en cache 5 min en mémoire. L'édition des prompts se fait directement dans le bucket, sans redéploiement.

## Stack

- Node.js 22, Express.js, ESM vanilla JS
- Google Cloud Storage (prompts)
- OpenAI API (GPT-4.1-mini, GPT-4o-mini)
- Salesforce REST API (OAuth2 Client Credentials)
- Surfe API, Piano API

## Lancer en local

```bash
npm install
cp .env.example .env   # remplir les valeurs
npm run dev            # AUTH_REQUIRED=false, hot-reload
```

## Ajouter une route

1. Créer `routes/<nom>/handler.js` avec `export default router`
2. Ajouter `'<nom>': 'moduleKey'` dans `ROUTE_PERMISSIONS` dans `server.js`
3. Le serveur monte automatiquement `/webhook/<nom>` au démarrage

## Prompts GCS

Chemins dans `gs://prompts-ext/` :

| Clé | Chemin |
|-----|--------|
| `entity-highlighter` | `Extensions/Vigie/Entity-highlighter/prompts/entity-highlighter.txt` |
| `alpha-reader` | `Extensions/Vigie/PDF-highlighter/prompt/entity-highlighter.txt` |
| `check-position` | `Extensions/Vigie/Linkedin-enrich/prompt/check-position.txt` |
| `linkedin-summary` | `Extensions/Vigie/Linkedin-enrich/prompt/linkedin-summary.txt` |

Pour modifier un prompt : éditer dans GCS puis `POST /admin/refresh` pour vider le cache immédiatement.

## Deploy

```bash
gcloud builds submit --config infra/cloudbuild.yaml \
  --substitutions _REGION=europe-west9,_PROJECT_ID=deft-gearbox-408209
```

## Sécurité

Chaque requête `/webhook/*` passe par deux middlewares :

1. **`middleware/auth.js`** — valide le token Azure AD via Microsoft Graph `/me`, cache 5 min
2. **`middleware/permissions.js`** — vérifie dans Firestore que l'utilisateur a accès au module concerné (`eh`, `linkedin`, etc.), cache 5 min

La map `ROUTE_PERMISSIONS` dans `server.js` associe chaque route à son module requis.
tempzdjflskdfjs