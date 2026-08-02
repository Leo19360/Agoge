/* ============================================
   AGOGE - Suivi de progression de l'import aliments
   Affiche le nombre de lignes chargées + taille de la table
   pendant l'exécution du LOAD DATA.
   ============================================ */
const mysql = require('mysql2/promise');

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'agoge'
    });

    // 1. Stats table depuis information_schema
    const [info] = await conn.query(`
      SELECT TABLE_ROWS,
             ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 1) AS size_mb,
             ROUND(DATA_LENGTH / 1024 / 1024, 1) AS data_mb,
             ROUND(INDEX_LENGTH / 1024 / 1024, 1) AS idx_mb
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aliments'
    `);
    if (info[0]) {
      console.log('📊 Table aliments :');
      console.log(`   TABLE_ROWS (approx) : ${Number(info[0].TABLE_ROWS).toLocaleString('fr-FR')}`);
      console.log(`   Taille totale        : ${info[0].size_mb} Mo`);
      console.log(`   Données              : ${info[0].data_mb} Mo`);
      console.log(`   Index                : ${info[0].idx_mb} Mo`);
    } else {
      console.log('Table aliments introuvable.');
    }

    // 2. Vérifier si un LOAD DATA / verrou est en cours
    const [procs] = await conn.query(`
      SELECT ID, TIME, STATE, LEFT(INFO, 80) AS info
      FROM information_schema.PROCESSLIST
      WHERE INFO IS NOT NULL
    `);
    console.log('\n⚙️ Processus MySQL actifs :');
    if (!procs.length) console.log('   (aucun)');
    for (const p of procs) {
      console.log(`   - PID ${p.ID} | ${p.TIME}s | ${p.STATE || ''} | ${p.info}`);
    }

  } catch (e) {
    console.error('Erreur:', e.message);
  } finally {
    if (conn) await conn.end();
  }
})();

