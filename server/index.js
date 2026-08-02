/* ============================================
   AGOGE - Démarrage local (Laragon)
   L'app Express partagée est dans server/app.js
   (utilisée aussi par la fonction Netlify)
   ============================================ */
const app = require('./app');
const db = require('./db');

const DEFAULT_PORT = parseInt(process.env.PORT || '3000', 10);

function listenWithFallback(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      console.log(`🏋️ Agoge server running on http://localhost:${actualPort}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const nextPort = port + 1;
        console.warn(`⚠️ Port ${port} déjà utilisé, tentative sur ${nextPort}...`);
        server.close(() => {
          listenWithFallback(nextPort).then(resolve).catch(reject);
        });
      } else {
        reject(err);
      }
    });
  });
}

// Démarre le serveur même si la base n'est pas encore disponible,
// afin d'éviter un crash total en production si MySQL met un peu de temps à répondre.
async function startServer() {
  try {
    await db.init();
    console.log('✅ Base de données prête');
  } catch (err) {
    console.error('⚠️ Impossible de se connecter à MySQL au démarrage :', err.message);
    console.warn('Le serveur continuera malgré cela et les routes API répondront avec une erreur si la base reste indisponible.');
  }

  try {
    await listenWithFallback(DEFAULT_PORT);
  } catch (err) {
    console.error('❌ Impossible de démarrer le serveur :', err.message);
    process.exit(1);
  }
}

startServer();

