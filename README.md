# Knowledge Base — Publication automatique

Site de publication statique avec catégorisation IA automatique via Claude.

## Structure

```
├── content/
│   ├── (déposes tes HTML ici → triés automatiquement)
│   ├── ia/
│   ├── agile/
│   ├── telco/
│   ├── cloud/
│   ├── architecture/
│   └── other/
├── public/          ← généré automatiquement, ne pas éditer
├── scripts/
│   └── categorize.js
├── netlify.toml
└── package.json
```

## Workflow

1. **Dépose** un fichier HTML dans `content/`
2. **Lance** `npm run build`
3. Le script Claude **analyse** le contenu, **détecte** la catégorie, **déplace** le fichier
4. `public/index.html` est **regénéré** avec toutes les cards à jour
5. **Git push** → Netlify déploie automatiquement

## Setup Netlify (première fois)

1. Crée un compte sur [netlify.com](https://netlify.com)
2. "Add new site" → "Import from Git" → connecte ton repo
3. Build settings sont lus depuis `netlify.toml` automatiquement
4. Ajoute ta clé API Anthropic dans **Site configuration → Environment variables** :
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   ```

## Catégories

| Catégorie      | Contenu                              |
|----------------|--------------------------------------|
| `ia`           | IA, LLM, ML, NLP, automatisation    |
| `agile`        | Scrum, Kanban, SAFe, management     |
| `telco`        | 5G, RAN, VNF, CNF, CaaS, réseau     |
| `cloud`        | Kubernetes, OpenShift, IaC, GitOps  |
| `architecture` | Design système, patterns, API       |
| `other`        | Tout le reste                        |

## Ajouter une catégorie

Dans `scripts/categorize.js`, modifie :
- `CATEGORIES` (tableau)
- `CATEGORY_LABELS` (label, emoji, couleur)

Et crée le dossier correspondant dans `content/`.
