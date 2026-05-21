# 🌍 Garoua Vibes — Blog

Blog dédié à la culture, les monuments et la vie locale de Garoua, Nord Cameroun.

---

## 📁 Structure du projet

```
garoua-vibes/
├── server.js          ← Serveur Node.js (backend)
├── package.json       ← Dépendances npm
├── data/
│   └── data.json      ← Base de données (articles, commentaires, newsletter)
└── public/
    ├── index.html     ← Blog public (frontend)
    ├── admin.html     ← Dashboard admin
    └── images/        ← Images uploadées (vide au départ)
```

---

## 🚀 Installation & Lancement

### 1. Installer les dépendances

Ouvrez un terminal dans le dossier `garoua-vibes/` et lancez :

```bash
npm install
```

### 2. Démarrer le serveur

```bash
node server.js
```

### 3. Ouvrir dans le navigateur

| Page | URL |
|------|-----|
| Blog public | http://localhost:3000 |
| Dashboard admin | http://localhost:3000/admin |

---

## 🔐 Connexion Admin

Mot de passe par défaut : `@12gahimle21`

> ⚠️ **Important** : Changez ce mot de passe dans `server.js` (ligne `ADMIN_PASSWORD`) avant de mettre en ligne.

---

## ✍️ Publier un article

1. Allez sur http://localhost:3000/admin
2. Connectez-vous avec votre mot de passe
3. Cliquez sur **"Nouvel article"** dans le menu
4. Remplissez le titre, la catégorie, le contenu, ajoutez une photo
5. Choisissez **"Publié"** dans le statut pour qu'il apparaisse sur le blog
6. Cliquez **"Enregistrer"**

L'article apparaît immédiatement sur le blog public.

---

## 💬 Modération des commentaires

Les commentaires soumis par les lecteurs sont en **attente de modération** par défaut.  
Pour les approuver :

1. Admin → **Commentaires**
2. Cliquez **"✓ Approuver"** sur le commentaire
3. Il apparaît instantanément sur le blog

---

## 📩 Newsletter

Les abonnés sont visibles dans Admin → **Newsletter**.  
Vous pouvez les exporter en CSV.

---

## 🖼️ Images

- Format acceptés : JPG, PNG, WEBP, GIF
- Taille max : 5 MB par image
- Uploadez via Admin → **Médiathèque** ou directement dans le formulaire article

---

## 🔧 Développement (rechargement automatique)

```bash
npm run dev
```
*(nécessite nodemon — installé automatiquement avec `npm install`)*

---

## 🌐 Mise en ligne (hébergement)

Pour héberger sur un VPS ou Render/Railway :

1. Uploadez tous les fichiers sur votre serveur
2. Lancez `npm install`
3. Démarrez avec `node server.js` ou un gestionnaire de processus comme **PM2** :
   ```bash
   npm install -g pm2
   pm2 start server.js --name garoua-vibes
   pm2 save
   ```

---

Fait avec ❤️ à Garoua, Cameroun.
