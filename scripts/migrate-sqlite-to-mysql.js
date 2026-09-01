/* ============================================
   AGOGE - Migration SQLite -> MySQL
   Copie les données de data/agoge.db vers MySQL
   ============================================ */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getEnv } = require('../server/config');

const SQLITE_DB = path.join(__dirname, '..', 'data', 'agoge.db');
const DB_HOST = getEnv('DB_HOST', { defaultValue: 'localhost' });
const DB_PORT = parseInt(getEnv('DB_PORT', { defaultValue: '3306' }), 10);
const DB_USER = getEnv('DB_USER', { defaultValue: 'root' });
const DB_PASSWORD = getEnv('DB_PASSWORD', { defaultValue: '' });
const DB_NAME = getEnv('DB_NAME', { defaultValue: 'agoge' });

const TABLES = [
  'users',
  'sessions',
  'exercises',
  'sets',
  'food_entries',
  'goals',
  'weight_entries',
  'body_measurements',
  'photos',
  'sync_queue'
];

function redactError(error) {
  const raw = String(error?.message || 'Erreur inconnue');
  return raw
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE)\b.*$/gi, '[requête SQL masquée]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email masqué]')
    .replace(/\b(?:password|token|secret|api[_-]?key)\b[^\n]*/gi, '[valeur sensible masquée]');
}

async function migrate() {
  if (!fs.existsSync(SQLITE_DB)) {
    console.log('ℹ️  Aucun fichier SQLite trouvé (data/agoge.db). Rien à migrer.');
    return;
  }

  const sqlite = new DatabaseSync(SQLITE_DB);
  const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, multipleStatements: true });

  console.log('🚀 Migration SQLite -> MySQL en cours...');

  for (const table of TABLES) {
    try {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (!rows.length) {
        console.log(`  - ${table}: 0 ligne (ignoré)`);
        continue;
      }

      // Désactive les contraintes FK le temps d'insérer
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');

      // Vide la table cible puis réinitialise l'auto_increment
      await conn.query(`DELETE FROM \`${table}\``);
      await conn.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);

      const cols = Object.keys(rows[0]).filter((c) => typeof c === 'string' && /^[a-zA-Z0-9_]+$/.test(c));
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO \`${table}\` (\`${cols.join('`, `')}\`) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = cols.map((c) => {
          const v = row[c];
          // Convertit les Buffer SQLite (rare) en string
          return Buffer.isBuffer(v) ? v.toString() : v;
        });
        await conn.query(sql, values);
      }

      console.log(`  - ${table}: ${rows.length} ligne(s) migrée(s) ✔`);
    } catch (e) {
      console.error(`  - ${table}: ERREUR -> ${redactError(e)}`);
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  sqlite.close();
  console.log('✅ Migration terminée !');
}

migrate().catch((e) => {
  console.error('❌ Échec de la migration :', redactError(e));
  process.exit(1);
});

