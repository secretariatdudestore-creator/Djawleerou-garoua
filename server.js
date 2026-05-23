/**
 * ═══════════════════════════════════════════════════
 *  DJAWLEEROU GAROUA — Serveur Backend (MongoDB)
 *  Lancer avec : node server.js
 *  Dashboard admin : http://localhost:3000/admin
 *  Blog public    : http://localhost:3000
 * ═══════════════════════════════════════════════════
 */

const express      = require('express');
const session      = require('express-session');
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const { MongoClient, ServerApiVersion } = require('mongodb');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');

// ── Charger .env en local ─────────────────────────────────────────
if (fs.existsSync('.env')) {
  const envLines = fs.readFileSync('.env', 'utf8').split('\n');
  for (const line of envLines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Rate Limiting ─────────────────────────────────────────────────
// Login : max 5 tentatives par 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: `<html><body style="font-family:sans-serif;text-align:center;padding:60px;">
    <h2>🔒 Trop de tentatives</h2>
    <p>Vous avez essayé trop de fois. Réessayez dans <strong>15 minutes</strong>.</p>
    <a href="/admin/login">Retour</a>
  </body></html>`,
  standardHeaders: true,
  legacyHeaders: false,
});

// API publique : max 100 requêtes par minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── MongoDB ───────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI;
let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
  });
  await client.connect();
  db = client.db('djawleerou');
  console.log('✅ Connecté à MongoDB Atlas');
}

const articles   = () => db.collection('articles');
const comments   = () => db.collection('comments');
const newsletter = () => db.collection('newsletter');
const counters   = () => db.collection('counters');

async function nextId(name) {
  const result = await counters().findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
}

// ── Chemins ───────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'public', 'images');

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'garoua-vibes-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Upload images ─────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `img-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, ['.jpg','.jpeg','.png','.webp','.gif'].includes(path.extname(file.originalname).toLowerCase()));
  }
});

app.use('/api/articles', apiLimiter);
app.use('/api/newsletter', apiLimiter);
app.use('/api/comments', apiLimiter);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'garoua2026';

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-');
}

// ════════════════════════════════════════════════════════════════
//  API PUBLIQUE
// ════════════════════════════════════════════════════════════════

app.get('/api/articles', async (req, res) => {
  try {
    const { category, tag, q } = req.query;
    const filter = { status: 'published' };
    if (category && category !== 'all') filter.category = category;
    if (tag) filter.tags = tag;
    if (q) {
      const s = new RegExp(q, 'i');
      filter.$or = [{ title: s }, { excerpt: s }, { tags: s }];
    }
    const result = await articles().find(filter).sort({ createdAt: -1 }).toArray();
    // Ajouter le nombre de commentaires approuvés pour chaque article
    const withCounts = await Promise.all(result.map(async a => {
      const count = await comments().countDocuments({ articleId: a.id, status: 'approved' });
      return { ...a, commentCount: count, likes: a.likes || 0 };
    }));
    res.json(withCounts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/articles/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Si connecté en admin → ne pas compter la vue
    const isAdmin = req.session && req.session.admin;
    
    // Vérifier le cookie pour éviter de compter plusieurs fois
    const cookieKey = `viewed_${id}`;
    const alreadyViewed = req.cookies && req.cookies[cookieKey];
    
    let a;
    if (isAdmin || alreadyViewed) {
      // Admin ou déjà vu — pas d'incrément
      a = await articles().findOne({ id, status: 'published' });
    } else {
      // Nouveau visiteur — incrément
      a = await articles().findOneAndUpdate(
        { id, status: 'published' },
        { $inc: { views: 1 } },
        { returnDocument: 'after' }
      );
      // Cookie 1 an
      res.cookie(cookieKey, '1', { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
    }
    
    if (!a) return res.status(404).json({ error: 'Article non trouvé' });
    const comms = await comments().find({ articleId: id, status: 'approved' }).toArray();
    res.json({ ...a, comments: comms });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/articles/:id/comments', async (req, res) => {
  try {
    const { name, email, text } = req.body;
    if (!name || !text) return res.status(400).json({ error: 'Nom et texte requis' });
    const id = parseInt(req.params.id);
    const a = await articles().findOne({ id });
    if (!a) return res.status(404).json({ error: 'Article non trouvé' });
    const comment = {
      id: await nextId('comment'),
      articleId: id,
      name: name.trim(),
      email: (email || '').trim(),
      text: text.trim(),
      status: 'pending',
      likes: 0,
      createdAt: new Date().toISOString()
    };
    await comments().insertOne(comment);
    res.json({ success: true, message: 'Commentaire en attente de modération', comment });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/comments/:id/like', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const c = await comments().findOneAndUpdate({ id }, { $inc: { likes: 1 } }, { returnDocument: 'after' });
    if (!c) return res.status(404).json({ error: 'Commentaire non trouvé' });
    res.json({ likes: c.likes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Like article
app.post('/api/articles/:id/like', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cookieKey = `liked_${id}`;
    const alreadyLiked = req.cookies && req.cookies[cookieKey];
    if (alreadyLiked) return res.json({ liked: false, message: 'Déjà liké' });
    const a = await articles().findOneAndUpdate(
      { id },
      { $inc: { likes: 1 } },
      { returnDocument: 'after' }
    );
    if (!a) return res.status(404).json({ error: 'Article non trouvé' });
    res.cookie(cookieKey, '1', { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.json({ liked: true, likes: a.likes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/newsletter', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email invalide' });
    if (await newsletter().findOne({ email })) return res.json({ success: true, message: 'Déjà abonné !' });
    await newsletter().insertOne({
      id: await nextId('newsletter'),
      name: (name || '').trim(),
      email: email.trim(),
      subscribedAt: new Date().toISOString()
    });
    res.json({ success: true, message: 'Abonnement confirmé !' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════════
app.get('/admin/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  const ip = req.ip;
  res.send(loginPage('', getAttempts(ip)));
});
app.post('/admin/login', loginLimiter, (req, res) => {
  const ip = req.ip;
  if (req.body.password === ADMIN_PASSWORD) {
    loginAttempts[ip] = 0; // reset si succès
    req.session.admin = true;
    res.redirect('/admin');
  } else {
    loginAttempts[ip] = (loginAttempts[ip] || 0) + 1;
    res.send(loginPage('Mot de passe incorrect ❌', loginAttempts[ip]));
  }
});
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ════════════════════════════════════════════════════════════════
//  ADMIN API — articles
// ════════════════════════════════════════════════════════════════
app.get('/api/admin/articles', requireAuth, async (req, res) => {
  try {
    res.json(await articles().find({}).sort({ createdAt: -1 }).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/articles', requireAuth, upload.single('img'), async (req, res) => {
  try {
    const { title, category, catLabel, catColor, excerpt, content, author, tags, status } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Titre et contenu requis' });
    const article = {
      id: await nextId('article'),
      title: title.trim(), slug: slugify(title),
      category: category || 'culture', catLabel: catLabel || category, catColor: catColor || '#c9502a',
      img: req.file ? '/images/' + req.file.filename : '',
      caption: (req.body.caption || '').trim(),
      excerpt: (excerpt || '').trim(), content: content.trim(),
      author: (author || 'Rédaction').trim(),
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      status: status || 'draft',
      featured: req.body.featured === 'true',
      trending: false,
      likes: 0,
      views: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    await articles().insertOne(article);
    res.json({ success: true, article });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/articles/:id', requireAuth, upload.single('img'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, category, catLabel, catColor, excerpt, content, author, tags, status } = req.body;
    const update = { updatedAt: new Date().toISOString() };
    if (title)    { update.title = title.trim(); update.slug = slugify(title); }
    if (category) update.category = category;
    if (catLabel) update.catLabel = catLabel;
    if (catColor) update.catColor = catColor;
    if (excerpt)  update.excerpt = excerpt.trim();
    if (content)  update.content = content.trim();
    if (author)   update.author = author.trim();
    if (tags)     update.tags = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (status)   update.status = status;
    if (req.body.caption  !== undefined) update.caption  = req.body.caption.trim();
    if (req.body.featured !== undefined) update.featured = req.body.featured === 'true';
    if (req.body.trending !== undefined) update.trending = req.body.trending === 'true';
    if (req.file) {
      const old = await articles().findOne({ id });
      if (old?.img?.startsWith('/images/')) {
        const p = path.join(__dirname, 'public', old.img);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      update.img = '/images/' + req.file.filename;
    }
    const result = await articles().findOneAndUpdate({ id }, { $set: update }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ error: 'Article non trouvé' });
    res.json({ success: true, article: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/articles/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const a = await articles().findOne({ id });
    if (!a) return res.status(404).json({ error: 'Article non trouvé' });
    if (a.img?.startsWith('/images/')) {
      const p = path.join(__dirname, 'public', a.img);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    await articles().deleteOne({ id });
    await comments().deleteMany({ articleId: id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Commentaires ──────────────────────────────────────────────────
app.get('/api/admin/comments', requireAuth, async (req, res) => {
  try {
    const comms = await comments().find({}).sort({ createdAt: -1 }).toArray();
    const enriched = await Promise.all(comms.map(async c => {
      const a = await articles().findOne({ id: c.articleId });
      return { ...c, articleTitle: a ? a.title : 'Article supprimé' };
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/comments/:id', requireAuth, async (req, res) => {
  try {
    const result = await comments().findOneAndUpdate(
      { id: parseInt(req.params.id) },
      { $set: { status: req.body.status } },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'Commentaire non trouvé' });
    res.json({ success: true, comment: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/comments/:id', requireAuth, async (req, res) => {
  try {
    await comments().deleteOne({ id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Newsletter ────────────────────────────────────────────────────
app.get('/api/admin/newsletter', requireAuth, async (req, res) => {
  try {
    res.json(await newsletter().find({}).sort({ subscribedAt: -1 }).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/newsletter/:id', requireAuth, async (req, res) => {
  try {
    await newsletter().deleteOne({ id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Stats ─────────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const allArticles  = await articles().find({}).toArray();
    const allComments  = await comments().find({}).toArray();
    const published    = allArticles.filter(a => a.status === 'published').length;
    const drafts       = allArticles.filter(a => a.status === 'draft').length;
    const totalViews   = allArticles.reduce((s, a) => s + (a.views || 0), 0);
    const pending      = allComments.filter(c => c.status === 'pending').length;
    const approved     = allComments.filter(c => c.status === 'approved').length;
    const totalNL      = await newsletter().countDocuments();
    const topArticles  = [...allArticles].sort((a,b) => (b.views||0)-(a.views||0)).slice(0,5)
      .map(a => ({ id: a.id, title: a.title, views: a.views||0, status: a.status }));
    res.json({
      articles: { published, drafts, total: allArticles.length },
      comments: { pending, approved, total: allComments.length },
      newsletter: { total: totalNL }, views: totalViews, topArticles
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Upload / images ───────────────────────────────────────────────
app.post('/api/admin/upload', requireAuth, upload.single('img'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  res.json({ success: true, url: '/images/' + req.file.filename });
});

app.get('/api/admin/images', requireAuth, (req, res) => {
  const files = fs.readdirSync(UPLOADS_DIR)
    .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
    .map(f => ({ name: f, url: '/images/' + f }));
  res.json(files);
});

app.delete('/api/admin/images/:name', requireAuth, (req, res) => {
  const p = path.join(UPLOADS_DIR, req.params.name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.json({ success: true });
});

// ── Pages ─────────────────────────────────────────────────────────
app.get('/admin*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ════════════════════════════════════════════════════════════════
//  PAGE DE LOGIN
// ════════════════════════════════════════════════════════════════
// Compteur de tentatives par IP (en mémoire)
const loginAttempts = {};

function getAttempts(ip) {
  if (!loginAttempts[ip]) loginAttempts[ip] = 0;
  return loginAttempts[ip];
}

function loginPage(error = '', attempts = 0) {
  const warnings = [
    null,
    { msg: "T'as rien à faire ici 😡", color: '#f97316' },
    { msg: "Arrête mec, c'est pas bien 😤", color: '#ef4444' },
    { msg: "Ce site t'appartient pas, fou le camp ! 😡", color: '#dc2626' },
    { msg: "T'es aveugle ou quoi ?! 🤦", color: '#b91c1c' },
    { msg: "Il te reste UN seul essai, connard. 💀", color: '#7f1d1d' },
  ];
  const warn = attempts > 0 && attempts <= 5 ? warnings[attempts] : null;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Admin — Djawleerou Garoua</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;900&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'DM Sans',sans-serif;background:#0d0f14;min-height:100vh;display:flex;align-items:center;justify-content:center;}
    .card{background:#161920;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:40px;width:360px;box-shadow:0 40px 80px rgba(0,0,0,.5);}
    .logo{text-align:center;margin-bottom:28px;}
    .logo-mark{width:52px;height:52px;background:#f97316;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:'Syne',serif;font-weight:900;font-size:26px;color:#fff;margin:0 auto 12px;transform:rotate(-3deg);}
    h1{font-family:'Syne',sans-serif;font-size:22px;font-weight:900;color:#fff;text-align:center;}
    p{font-size:13px;color:rgba(255,255,255,.4);text-align:center;margin-top:4px;}
    label{display:block;font-size:12px;font-weight:500;color:rgba(255,255,255,.5);margin:20px 0 6px;letter-spacing:.5px;}
    input{width:100%;padding:11px 14px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.1);border-radius:8px;color:#fff;font-size:14px;outline:none;transition:border-color .2s;}
    input:focus{border-color:#f97316;}
    .error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:16px;text-align:center;}
    .warning{padding:12px 14px;border-radius:8px;font-size:14px;font-weight:700;margin-top:16px;text-align:center;animation:shake .4s ease;}
    @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
    button{width:100%;padding:13px;background:#f97316;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;margin-top:20px;transition:background .2s;}
    button:hover{background:#ea6c00;}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-mark">D</div>
      <h1>Djawleerou Garoua</h1>
      <p>Dashboard Admin</p>
    </div>
    ${warn ? `<div class="warning" style="background:${warn.color}22;border:1px solid ${warn.color}55;color:${warn.color};">${warn.msg}</div>` : ''}
    <form method="POST" action="/admin/login">
      <label>MOT DE PASSE</label>
      <input type="password" name="password" placeholder="••••••••" autofocus required/>
      ${error && !warn ? `<div class="error">${error}</div>` : ''}
      <button type="submit">Connexion →</button>
    </form>
  </div>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════
//  MIGRATION AUTOMATIQUE (si MongoDB est vide)
// ════════════════════════════════════════════════════════════════
async function autoMigrate() {
  try {
    const count = await articles().countDocuments();
    if (count > 0) {
      console.log(`ℹ️  Base déjà remplie (${count} articles) — migration ignorée`);
      return;
    }
    const dataFile = path.join(__dirname, 'data', 'data.json');
    if (!fs.existsSync(dataFile)) {
      console.log('ℹ️  Pas de data.json trouvé — migration ignorée');
      return;
    }
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    console.log('🚀 Base vide — migration automatique en cours...');
    if (data.articles && data.articles.length > 0) {
      await articles().insertMany(data.articles);
      console.log(`✅ ${data.articles.length} articles importés`);
    }
    if (data.comments && data.comments.length > 0) {
      await comments().insertMany(data.comments);
      console.log(`✅ ${data.comments.length} commentaires importés`);
    }
    if (data.newsletter && data.newsletter.length > 0) {
      await newsletter().insertMany(data.newsletter);
      console.log(`✅ ${data.newsletter.length} abonnés importés`);
    }
    if (data.nextId) {
      await counters().deleteMany({});
      await counters().insertMany([
        { _id: 'article',    seq: data.nextId.article    || 10 },
        { _id: 'comment',    seq: data.nextId.comment    || 1  },
        { _id: 'newsletter', seq: data.nextId.newsletter || 1  }
      ]);
    }
    console.log('🎉 Migration automatique terminée !');
  } catch (e) {
    console.error('⚠️  Erreur migration automatique :', e.message);
  }
}

// ════════════════════════════════════════════════════════════════
//  DÉMARRAGE
// ════════════════════════════════════════════════════════════════
connectDB().then(async () => {
  await autoMigrate();
  app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  🌍  DJAWLEEROU GAROUA — Serveur démarré ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Blog    →  http://localhost:${PORT}         ║`);
    console.log(`║  Admin   →  http://localhost:${PORT}/admin   ║`);
    console.log('╚══════════════════════════════════════════╝\n');
  });
}).catch(err => {
  console.error('❌ Erreur connexion MongoDB :', err.message);
  process.exit(1);
});
