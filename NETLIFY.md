# 🚀 Déploiement de l'application Agoge sur Netlify

## ⚠️ Important : base de données

Ton MySQL actuel est **local** (phpMyAdmin / Laragon). Netlify héberge ton code sur
des serveurs dans le cloud : **il ne peut pas accéder à ta base locale**.

👉 Tu dois créer une base **MySQL dans le cloud** (offres gratuites possibles) :
- **Railway** (railway.app) — MySQL, essai gratuit
- **TiDB Cloud** (tidbcloud.com) — MySQL compatible, offre serverless gratuite
- **Aiven** (aiven.io) — MySQL, plan gratuit limité
- **Clever Cloud**, **Alwaysdata**, **PlanetScale**, **Hostinger**...

Une fois la base créée, Netlify se connectera à cette base **à distance** via les
variables d'environnement ci-dessous.

---

## 1. Convertir ta base SQLite en fichier SQL MySQL (obligatoire)

Ton application fonctionnait avec **SQLite** (`data/agoge.db`). Netlify + MySQL cloud
ne peuvent pas lire ce fichier binaire. Il faut **convertir** tes données.

### Étape 1a : générer le fichier SQL MySQL

```bash
node scripts/export-sqlite-to-sql.js
```

Cela crée `data/agoge-mysql.sql` (tables + données), **importable dans phpMyAdmin**.

> ⚠️ Ne jamais importer `data/agoge.db` directement dans phpMyAdmin : c'est un
> fichier SQLite binaire, d'où l'erreur `#1064 ... 'SQLite format 3'`.

### Étape 1b : importer dans la base cloud

1. Crée ta base MySQL cloud (voir §2 ci-dessous)
2. Dans l'interface du provider (ou phpMyAdmin / TablePlus / un client MySQL) :
   **Import → sélectionne `data/agoge-mysql.sql` → Exécuter**
3. Vérifie que les tables existent (`users`, `sessions`, `exercises`, `sets`, ...)

### Étape 1c (alternative) : migration automatisée vers MySQL local

Si tu veux d'abord tester sur ta base **Laragon locale** :
```bash
node scripts/migrate-sqlite-to-mysql.js
```
Cela copie les données de `data/agoge.db` vers la base MySQL `agoge` locale.

---

## 2. Créer la base MySQL cloud

Crée une base MySQL dans le cloud (voir la liste au début). Récupère ensuite :
l'hôte (`DB_HOST`), le port (`DB_PORT`), l'utilisateur (`DB_USER`), le mot de passe
(`DB_PASSWORD`) et le nom de la base (`DB_NAME`). Si le provider le demande, note
aussi si le **SSL** est requis (`DB_SSL=true`).

L'application crée automatiquement les tables manquantes au premier appel de l'API
(`netlify/functions/api.js` appelle `db.init()`). Tu peux donc importer le fichier
`agoge-mysql.sql` **ou** laisser l'app créer les tables — le plus simple reste
d'importer le SQL pour conserver tes données.

---

## 3. Variables d'environnement sur Netlify

Dans le dashboard Netlify → **Site settings → Environment variables**, ajoute :

| Variable | Exemple (cloud) | Description |
|----------|-----------------|-------------|
| `DB_HOST` | `sqlXX.tidbcloud.com` ou `containers-us-west-xxx.railway.app` | Hôte de ta base cloud |
| `DB_PORT` | `3306` (ou `4000` pour TiDB) | Port MySQL |
| `DB_USER` | `root` ou ton utilisateur | Utilisateur |
| `DB_PASSWORD` | `ton_mot_de_passe` | Mot de passe |
| `DB_NAME` | `agoge` | Nom de la base (à créer côté cloud) |
| `DB_SSL` | `true` | Active le chiffrement SSL (souvent requis en cloud) |
| `JWT_SECRET` | `une_phrase_secrete_longue` | Secret JWT (change-le !) |

> ⚠️ **Ne mets jamais** tes identifiants locaux Laragon (`localhost`, `root`, vide).
> Ils ne fonctionneront pas depuis Netlify.

---

## 4. Déploiement

### Option A : via l'interface Netlify (recommandée)
1. Va sur https://app.netlify.com → **Add new site → Import an existing project**
2. Connecte ton dépôt **GitHub/GitLab/Bitbucket** et sélectionne le projet
3. Netlify détecte automatiquement la configuration :
   - **Build command** : vide (pas de build)
   - **Publish directory** : `public`
   - **Functions directory** : `netlify/functions`
4. Ajoute les variables d'environnement (voir §3)
5. **Deploy site**

### Option B : via le CLI Netlify
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod --build
```

---

## 5. Vérification après déploiement

- ✅ `https://tondomaine.netlify.app/` → l'app doit s'afficher
- ✅ `https://tondomaine.netlify.app/.netlify/functions/api/health` → `{"status":"ok"}`
- ✅ Se connecter avec un compte existant → les données doivent s'afficher

### Si tu vois « Page not found »
1. Vérifie que `public/index.html` existe et que le dossier `public` est bien le
   **publish directory**
2. Vérifie que le fichier `public/_redirects` est présent (il a été créé)
3. Redéploie (Netlify est parfois lent à prendre en compte les `_redirects`)

### Si l'API renvoie une erreur
- `"Impossible de se connecter à la base de données MySQL"` → tes variables
  `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT` sont incorrectes, ou `DB_SSL` est
  nécessaire. Vérifie aussi que la base est accessible depuis Internet (pas un
  `localhost` bloqué).
- `"Route not found"` → le chemin `/api/...` n'existe pas ; vérifie les routes
  dans `server/routes/`.

---

## 6. Mode local (Laragon) — inchangé

```bash
npm install
npm start
# -> http://localhost:3000
```

Le serveur Express est partagé entre le mode local (`server/index.js`) et la
fonction serverless (`netlify/functions/api.js`) via `server/app.js`.

