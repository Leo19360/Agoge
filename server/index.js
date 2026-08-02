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

// Initialise la base de données MySQL puis démarre le serveur
db.init()
  .then(() => listenWithFallback(DEFAULT_PORT))
  .catch((err) => {
    console.error('❌ Impossible de se connecter à MySQL :', err.message);
    console.error('Vérifie que MySQL (Laragon) est démarré et que les identifiants sont corrects.');
    process.exit(1);
  });

