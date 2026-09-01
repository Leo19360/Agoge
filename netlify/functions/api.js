/* ============================================
   AGOGE - Fonction Netlify Serverless
   Wrapper pour Express app
   ============================================ */
const serverless = require('serverless-http');
const app = require('../server/app');

// Wrap l'app Express pour Netlify
module.exports.handler = serverless(app);
