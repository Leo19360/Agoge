/* ============================================
   AGOGE - Application Express (partagée local/serverless)
   ============================================ */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const nutritionRoutes = require('./routes/nutrition');
const bodyRoutes = require('./routes/body');

const app = express();

// Cloudflate Tunnel : faire confiance au proxy local
app.set('trust proxy', 1);

// Dossier uploads : stocké en mémoire/DB pour éviter les problèmes d’hébergement
// Infinyfree bloque la création de dossiers hors htdocs/public_html.
const uploadsDir = process.env.UPLOADS_DIR || (process.env.INFINYFREE === '1' ? '/tmp/agoge-uploads' : path.join(__dirname, '..', 'uploads'));

function ensureUploadsDir() {
  try {
    const safePath = uploadsDir || '';
    const isAllowedPath = safePath.startsWith('/tmp') || safePath.includes('htdocs') || safePath.includes('public_html');
    if (isAllowedPath && !fs.existsSync(safePath)) {
      fs.mkdirSync(safePath, { recursive: true });
    }
  } catch (e) {
    console.warn('⚠️ Dossier uploads non créé :', e.message);
  }
}

ensureUploadsDir();

// Security headers (Helmet) - configuration pour Debian + Cloudflare Tunnel
app.use(helmet({
  contentSecurityPolicy: false  // On gère le CSP manuellement
}));

// Content Security Policy personnalisée - Permissive pour fonctionner avec Cloudflare
app.use((req, res, next) => {
  const cspHeader = "default-src 'self' https:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https: https://static.openfoodfacts.org https://world.openfoodfacts.org; " +
    "connect-src 'self' https: http: ws: wss: https://world.openfoodfacts.org https://static.openfoodfacts.org; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "media-src 'self' https: data: blob:";
  
  res.setHeader('Content-Security-Policy', cspHeader);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  next();
});

// HSTS for production (attention: sur Cloudflare, gérer via dashboard)
if (process.env.NODE_ENV === 'production') {
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
}

// CORS: restrict origins in production via CORS_ORIGINS env (comma-separated)
const { getEnv, isProduction } = require('./config');
const corsOrigins = getEnv('CORS_ORIGINS', { defaultValue: '' });
if (corsOrigins && corsOrigins.trim()) {
  const allowed = corsOrigins.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: function(origin, cb) { if (!origin) return cb(null, true); return cb(null, allowed.indexOf(origin) !== -1); }, optionsSuccessStatus: 200 }));
} else {
  // default: allow all in dev, restrict in production
  app.use(cors({ origin: isProduction ? false : true }));
}

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadsDir, { fallthrough: true }));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Image proxy pour OpenFoodFacts (contourne les problèmes CORS)
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).json({ error: 'URL manquante' });
  }
  
  // Vérifier que c'est bien une URL OpenFoodFacts
  if (!imageUrl.includes('openfoodfacts.org') && !imageUrl.includes('openfoodfacts.net')) {
    return res.status(403).json({ error: 'Domaine non autorisé' });
  }
  
  try {
    const https = imageUrl.startsWith('https') ? require('https') : require('http');
    https.get(imageUrl, (imgRes) => {
      res.setHeader('Content-Type', imgRes.headers['content-type']);
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 jours
      imgRes.pipe(res);
    }).on('error', (err) => {
      res.status(500).json({ error: 'Erreur proxy image' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// OpenFoodFacts API proxy (contourne CORS)
app.get('/api/proxy-offs', async (req, res) => {
  try {
    const https = require('https');
    const queryString = new URLSearchParams(req.query).toString();
    const url = `https://world.openfoodfacts.org/cgi/search.pl?${queryString}`;
    
    https.get(url, (offsRes) => {
      let data = '';
      offsRes.on('data', chunk => data += chunk);
      offsRes.on('end', () => {
        try {
          res.json(JSON.parse(data));
        } catch (e) {
          res.status(500).json({ error: 'Erreur parsing OFFS' });
        }
      });
    }).on('error', (err) => {
      res.status(500).json({ error: 'Erreur requête OFFS' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// OpenFoodFacts barcode API proxy
app.get('/api/proxy-offs-barcode/:barcode', async (req, res) => {
  try {
    const https = require('https');
    const barcode = req.params.barcode;
    const url = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json`;
    
    https.get(url, (offsRes) => {
      let data = '';
      offsRes.on('data', chunk => data += chunk);
      offsRes.on('end', () => {
        try {
          res.json(JSON.parse(data));
        } catch (e) {
          res.status(500).json({ error: 'Erreur parsing OFFS' });
        }
      });
    }).on('error', (err) => {
      res.status(500).json({ error: 'Erreur requête OFFS' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/body', bodyRoutes);

// 404 pour l'API
app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

// Fallback SPA (avec garde en mode serverless)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Page not found' });
  }
});

module.exports = app;

// Global error handler to avoid leaking stack traces in production
app.use((err, req, res, next) => {
  console.error(err && err.stack ? err.stack : err);
  if (isProduction) {
    res.status(500).json({ error: 'Erreur serveur' });
  } else {
    res.status(500).json({ error: err && err.message ? err.message : 'Erreur serveur' });
  }
});

