/* ============================================
   AGOGE - Migration SQLite -> MySQL
   Copie les données de data/agoge.db vers MySQL
   ============================================ */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const mysql = require('mysql2/promise');

const SQLITE_DB = path.join(__dirname, '..', 'data', 'agoge.db');
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'agoge';

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

async function migrate() {
  if (!require('fs').existsSync(SQLITE_DB)) {
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

      const cols = Object.keys(rows[0]);
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
      console.error(`  - ${table}: ERREUR -> ${e.message}`);
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  sqlite.close();
  console.log('✅ Migration terminée !');
}

migrate().catch((e) => {
  console.error('❌ Échec de la migration :', e.message);
  process.exit(1);
});

