/* ============================================
   AGOGE - Vérifie si l'import a traité tout le fichier
   Compare les derniers codes du CSV avec la table MySQL
   ============================================ */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const CSV_FILE = process.env.CSV_FILE || path.join(__dirname, '..', 'en.openfoodfacts.org.products.csv');

async function tailCodes(file, n = 5) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(file).size;
    const chunkSize = 1024 * 1024;
    const fd = fs.openSync(file, 'r');
    let buffer = Buffer.alloc(chunkSize);
    let pos = size;
    let collected = Buffer.alloc(0);
    let lines = [];

    function check() {
      const text = collected.toString('utf8');
      const parts = text.split('\n');
      // On garde les n dernières lignes complètes
      const complete = parts.filter((l, i) => i === parts.length - 1 ? l === '' : true);
      const candidates = complete.slice(-n - 1);
      if (candidates.length >= n + 1 || pos <= 0) {
        fs.closeSync(fd);
        resolve(candidates.slice(-n));
        return true;
      }
      return false;
    }

    function step() {
      if (pos <= 0) {
        check();
        return;
      }
      const toRead = Math.min(chunkSize, pos);
      fs.read(fd, buffer, 0, toRead, pos - toRead, (err, br) => {
        if (err) return reject(err);
        pos -= br;
        collected = Buffer.concat([buffer.slice(0, br), collected]);
        if (!check()) step();
      });
    }
    step();
  });
}

(async () => {
  let conn;
  try {
    const stat = fs.statSync(CSV_FILE);
    console.log('Fichier:', CSV_FILE);
    console.log('Taille  :', (stat.size / 1024 / 1024 / 1024).toFixed(2), 'Go');
    console.log('Modifié :', stat.mtime.toISOString());

    const tail = await tailCodes(CSV_FILE);
    const tailCodesArr = tail.map((l) => l.split('\t')[0]);
    console.log('\nDernières lignes du CSV (code) :');
    tailCodesArr.forEach((c) => console.log('  ', c));

    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'agoge'
    });

    const [cnt] = await conn.query('SELECT COUNT(*) AS n FROM aliments');
    console.log('\nLignes dans la table :', Number(cnt[0].n).toLocaleString('fr-FR'));

    for (const code of tailCodesArr) {
      const [rows] = await conn.query('SELECT COUNT(*) AS n FROM aliments WHERE code = ?', [code]);
      console.log(`  code ${code} dans la table ? ${rows[0].n > 0 ? 'OUI ✅' : 'NON ❌'}`);
    }

    const [mx] = await conn.query('SELECT MAX(id) AS mx, MAX(code) AS maxcode FROM aliments');
    console.log('\nMAX(id) table:', mx[0].mx, '| MAX(code) table:', mx[0].maxcode);

  } catch (e) {
    console.error('Erreur:', e.message);
  } finally {
    if (conn) await conn.end();
  }
})();

