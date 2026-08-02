/* ============================================
   AGOGE - Application Express (partagée local/serverless)
   ============================================ */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const nutritionRoutes = require('./routes/nutrition');
const bodyRoutes = require('./routes/body');

const app = express();

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

app.use(cors());
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

