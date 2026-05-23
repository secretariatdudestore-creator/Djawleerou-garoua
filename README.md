# Djawleerou Garoua 🌍

Blog dédié à la culture, l'histoire, les monuments et la vie locale de Garoua, Nord Cameroun.

## 🚀 Démarrage en local

### Prérequis
- Node.js installé
- Compte MongoDB Atlas
- Fichier `.env` configuré (voir ci-dessous)

### Installation

```bash
npm install
node server.js
```

### Configuration `.env`

Créer un fichier `.env` à la racine du projet :

```
ADMIN_PASSWORD=votre_mot_de_passe
SESSION_SECRET=votre_secret
MONGODB_URI=votre_uri_mongodb
PORT=3000
```

> ⚠️ Ne jamais partager ou publier votre fichier `.env`

## 📁 Structure du projet

```
djawleerou-garoua/
├── public/
│   ├── index.html      # Blog public
│   ├── admin.html      # Dashboard admin
│   └── images/         # Images uploadées
├── data/
│   └── data.json       # Backup données
├── server.js           # Serveur Node.js
├── .env                # Variables d'environnement (non publié)
└── README.md
```

## 🌐 Accès

| Page | URL |
|------|-----|
| Blog public | http://localhost:3000 |
| Dashboard admin | http://localhost:3000/admin |

## 🏗 Stack technique

- **Frontend** : HTML, CSS, JavaScript vanilla
- **Backend** : Node.js + Express
- **Base de données** : MongoDB Atlas
- **Hébergement** : Render
- **Déploiement** : GitHub

## 📝 Licence

Tous droits réservés © 2026 Djawleerou Garoua
