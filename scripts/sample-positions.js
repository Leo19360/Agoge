/* ============================================
   AGOGE - Échantillonnage du CSV à différentes profondeurs
   Vérifie si les codes aux positions 5%,25%,50%,75%,90%,95%,99% du fichier
   sont présents dans la table MySQL -> confirme si l'import a tout lu.
   ============================================ */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const CSV_FILE = process.env.CSV_FILE || path.join(__dirname, '..', 'en.openfoodfacts.org.products.csv');

function readCodeAtFraction(file, fraction) {
  return new Promise((resolve, reject) => {
    const stats = fs.statSync(file);
    const target = Math.floor(stats.size * fraction);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(1024 * 1024); // 1 Mo autour de la position
    // On lit un peu avant la position cible pour attraper une ligne complète
    const start = Math.max(0, target - 512 * 1024);
    fs.read(fd, buf, 0, buf.length, start, (err, bytesRead) => {
      if (err) return reject(err);
      fs.closeSync(fd);
      const text = buf.slice(0, bytesRead).toString('utf8');
      // On trouve la première ligne qui commence par un chiffre
      const lines = text.split('\n');
      for (let i = 1; i < lines.length; i++) { // on saute la ligne partielle du début
        const line = lines[i];
        const first = line.charAt(0);
        if (first >= '0' && first <= '9') {
          const code = line.split('\t')[0];
          return resolve(code);
        }
      }
      // fallback : première ligne de tout le buffer
      for (const line of lines) {
        const first = line.charAt(0);
        if (first >= '0' && first <= '9') {
          return resolve(line.split('\t')[0]);
        }
      }
      resolve(null);
    });
  });
}

(async () => {
  let conn;
  try {
    const stats = fs.statSync(CSV_FILE);
    console.log('Fichier:', (stats.size / 1024 / 1024 / 1024).toFixed(2), 'Go');

    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'agoge'
    });
    const [cnt] = await conn.query('SELECT COUNT(*) AS n FROM aliments');
    console.log('Lignes dans la table :', Number(cnt[0].n).toLocaleString('fr-FR'), '\n');

    const fractions = [0.05, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99, 1.0];
    for (const f of fractions) {
      const code = await readCodeAtFraction(CSV_FILE, f);
      if (!code) {
        console.log(`${(f * 100).toFixed(0)}%  : code introuvable`);
        continue;
      }
      const [rows] = await conn.query('SELECT COUNT(*) AS n FROM aliments WHERE code = ?', [code]);
      const present = rows[0].n > 0;
      console.log(`${(f * 100).toFixed(0)}%  : code ${code} -> ${present ? 'PRÉSENT ✅' : 'ABSENT ❌'}`);
    }
  } catch (e) {
    console.error('Erreur:', e.message);
  } finally {
    if (conn) await conn.end();
  }
})();

