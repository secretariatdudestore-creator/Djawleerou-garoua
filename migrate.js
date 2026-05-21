/**
 * ═══════════════════════════════════════════════════
 *  MIGRATION data.json → MongoDB Atlas
 *  Lancer UNE SEULE FOIS avec : node migrate.js
 * ═══════════════════════════════════════════════════
 */

const { MongoClient, ServerApiVersion } = require('mongodb');
const fs   = require('path');
const path = require('path');

// Charger .env
const fsSync = require('fs');
if (fsSync.existsSync('.env')) {
  const envLines = fsSync.readFileSync('.env', 'utf8').split('\n');
  for (const line of envLines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
}

const MONGO_URI = process.env.MONGODB_URI;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');

async function migrate() {
  console.log('🚀 Démarrage de la migration...\n');

  // Lire data.json
  const data = JSON.parse(fsSync.readFileSync(DATA_FILE, 'utf8'));
  console.log(`📄 Articles trouvés   : ${data.articles.length}`);
  console.log(`💬 Commentaires       : ${data.comments.length}`);
  console.log(`📧 Abonnés newsletter : ${data.newsletter.length}\n`);

  // Connexion MongoDB
  const client = new MongoClient(MONGO_URI, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
  });
  await client.connect();
  const db = client.db('djawleerou');
  console.log('✅ Connecté à MongoDB Atlas\n');

  // Vider les collections existantes (évite les doublons si relancé)
  await db.collection('articles').deleteMany({});
  await db.collection('comments').deleteMany({});
  await db.collection('newsletter').deleteMany({});
  await db.collection('counters').deleteMany({});

  // Insérer les articles
  if (data.articles.length > 0) {
    await db.collection('articles').insertMany(data.articles);
    console.log(`✅ ${data.articles.length} articles importés`);
  }

  // Insérer les commentaires
  if (data.comments.length > 0) {
    await db.collection('comments').insertMany(data.comments);
    console.log(`✅ ${data.comments.length} commentaires importés`);
  }

  // Insérer les abonnés newsletter
  if (data.newsletter.length > 0) {
    await db.collection('newsletter').insertMany(data.newsletter);
    console.log(`✅ ${data.newsletter.length} abonnés importés`);
  }

  // Initialiser les compteurs (pour que les nouveaux IDs continuent bien)
  await db.collection('counters').insertMany([
    { _id: 'article',    seq: data.nextId.article    },
    { _id: 'comment',    seq: data.nextId.comment    },
    { _id: 'newsletter', seq: data.nextId.newsletter }
  ]);
  console.log('✅ Compteurs initialisés');

  await client.close();
  console.log('\n🎉 Migration terminée avec succès !');
  console.log('👉 Tu peux maintenant lancer : node server.js');
}

migrate().catch(err => {
  console.error('❌ Erreur migration :', err.message);
  process.exit(1);
});
