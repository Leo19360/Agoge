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

// Security headers (Helmet)
try {
  app.use(helmet({
    // default helmet options
  }));
  // Content Security Policy: allow self and data for images; allow inline scripts/styles temporarily (app uses inline handlers)
  app.use(helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:'],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"]
    }
  }));
  // HSTS for production
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
} catch (e) {
  console.warn('⚠️ Helmet non chargé :', e.message);
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

