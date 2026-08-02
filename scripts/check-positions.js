/* ============================================
   AGOGE - Vérifie précisément le contenu du CSV à des positions données
   Lit une large fenêtre autour de la fraction choisie et affiche les
   PREMIÈRES lignes chiffrées complètes (code\t... jusqu'à la tab suivante).
   ============================================ */
const fs = require('fs');
const path = require('path');

const CSV_FILE = process.env.CSV_FILE || path.join(__dirname, '..', 'en.openfoodfacts.org.products.csv');
const FRACTIONS = [0.05, 0.99, 1.0];
const PRE = 8 * 1024 * 1024; // 8 Mo avant
const POST = 4 * 1024 * 1024; // 4 Mo après

function sample(file, fraction) {
  const stats = fs.statSync(file);
  const target = Math.floor(stats.size * fraction);
  const start = Math.max(0, target - PRE);
  const end = Math.min(stats.size, target + POST);
  const len = end - start;
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, start);
  fs.closeSync(fd);
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  // On cherche de vraies lignes de données (qui commencent par un code de 1+ chiffres)
  const codes = [];
  for (const line of lines) {
    const m = line.match(/^([0-9]+)\t/);
    if (m) {
      codes.push(m[1]);
      if (codes.length >= 5) break;
    }
  }
  return codes;
}

(async () => {
  const stats = fs.statSync(CSV_FILE);
  console.log('Fichier:', (stats.size / 1024 / 1024 / 1024).toFixed(2), 'Go');
  for (const f of FRACTIONS) {
    const codes = sample(CSV_FILE, f);
    console.log(`\nPosition ${(f * 100).toFixed(0)}% (${(stats.size * f / 1024 / 1024 / 1024).toFixed(2)} Go) :`);
    codes.forEach((c) => console.log('  ', c));
  }
})();

