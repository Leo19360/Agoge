/* ============================================
   AGOGE - Diagnostic de l'écart d'import
   Vérifie sql_mode, codes vides/NULL, etc.
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

    const [mode] = await conn.query('SELECT @@sql_mode AS mode');
    console.log('sql_mode:', mode[0].mode);

    const [info] = await conn.query("SHOW CREATE TABLE aliments");
    console.log('\nCREATE TABLE:\n', info[0]['Create Table']);

    const [nullCodes] = await conn.query('SELECT COUNT(*) AS n FROM aliments WHERE code IS NULL OR code = ""');
    console.log('\nCodes NULL/vides dans la table :', Number(nullCodes[0].n).toLocaleString('fr-FR'));

    const [minId] = await conn.query('SELECT MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) AS n FROM aliments');
    console.log('id min:', minId[0].min_id, '| id max:', minId[0].max_id, '| count:', Number(minId[0].n).toLocaleString('fr-FR'));

    const [dups] = await conn.query('SELECT code, COUNT(*) AS c FROM aliments GROUP BY code HAVING c > 1 LIMIT 5');
    console.log('Exemples codes dupliqués:', JSON.stringify(dups));

    const [tableInfo] = await conn.query(`
      SELECT TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aliments'
    `);
    console.log('TABLE_ROWS (approx):', Number(tableInfo[0].TABLE_ROWS).toLocaleString('fr-FR'));

  } catch (e) {
    console.error('Erreur:', e.message);
  } finally {
    if (conn) await conn.end();
  }
})();

