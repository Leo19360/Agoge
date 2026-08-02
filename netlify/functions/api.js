/* ============================================
   AGOGE - Fonction Netlify (API serverless)
   ============================================ */
const serverless = require('serverless-http');
const app = require('../../server/app');
const db = require('../../server/db');

let initialized = false;

async function ensureDb() {
  if (initialized) return;
  await db.init();
  initialized = true;
}

// Normalise le chemin reçu pour que les routes Express (/api/...) matchent.
// Selon la config Netlify, event.path peut être :
//   - "/api/health"                       (chemin original)
//   - "/.netlify/functions/api/health"    (chemin réécrit avec préfixe fonction)
//   - "/" ou ""                           (appel direct de la fonction)
function normalizePath(p) {
  if (!p) return '/api';

  // Retire le préfixe de la fonction s'il est présent
  const fnPrefix = '/.netlify/functions/api';
  if (p.startsWith(fnPrefix)) {
    p = p.slice(fnPrefix.length);
  }

  if (p === '' || p === '/') return '/api';
  if (p === '/api' || p.startsWith('/api/')) return p;

  // Cas résiduel : "/health" -> "/api/health"
  return '/api' + (p.startsWith('/') ? p : '/' + p);
}

// Handler serverless-http
const serverlessHandler = serverless(app);

exports.handler = async (event, context) => {
  event.path = normalizePath(event.path || '/');

  try {
    await ensureDb();
  } catch (e) {
    console.error('DB init error:', e.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Impossible de se connecter à la base de données MySQL.',
        detail: e.message,
        hint: "Configure les variables d'environnement DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (et DB_SSL si besoin) sur Netlify : Site settings → Environment variables."
      })
    };
  }

  return serverlessHandler(event, context);
};

