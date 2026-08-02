/* ============================================
   AGOGE - Vérification de la table aliments
   Comptage réel + qualité des données
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

    const [cnt] = await conn.query('SELECT COUNT(*) AS n, COUNT(DISTINCT code) AS codes FROM aliments');
    console.log('📦 Total lignes        :', Number(cnt[0].n).toLocaleString('fr-FR'));
    console.log('   Codes distincts     :', Number(cnt[0].codes).toLocaleString('fr-FR'));

    const [withName] = await conn.query("SELECT COUNT(*) AS n FROM aliments WHERE product_name IS NOT NULL AND product_name <> ''");
    console.log('   Avec nom            :', Number(withName[0].n).toLocaleString('fr-FR'));

    const [withBrands] = await conn.query("SELECT COUNT(*) AS n FROM aliments WHERE brands IS NOT NULL AND brands <> ''");
    console.log('   Avec marque         :', Number(withBrands[0].n).toLocaleString('fr-FR'));

    const [withKcal] = await conn.query('SELECT COUNT(*) AS n FROM aliments WHERE energy_kcal_100g IS NOT NULL');
    console.log('   Avec kcal           :', Number(withKcal[0].n).toLocaleString('fr-FR'));

    const [withProteins] = await conn.query('SELECT COUNT(*) AS n FROM aliments WHERE proteins_100g IS NOT NULL');
    console.log('   Avec protéines      :', Number(withProteins[0].n).toLocaleString('fr-FR'));

    const [withNutriscore] = await conn.query("SELECT COUNT(*) AS n FROM aliments WHERE nutriscore_grade IS NOT NULL AND nutriscore_grade <> ''");
    console.log('   Avec Nutri-Score    :', Number(withNutriscore[0].n).toLocaleString('fr-FR'));

    // Exemples pour "poulet"
    const [poulet] = await conn.query(`
      SELECT code, product_name, brands, energy_kcal_100g, proteins_100g, carbohydrates_100g, fat_100g
      FROM aliments
      WHERE product_name LIKE '%poulet%' AND energy_kcal_100g IS NOT NULL
      LIMIT 8
    `);
    console.log('\n🍗 Exemples "poulet" :');
    for (const r of poulet) {
      console.log(`   - ${r.product_name} (${r.brands || '?'}) : ${r.energy_kcal_100g} kcal, P ${r.proteins_100g}, G ${r.carbohydrates_100g}, L ${r.fat_100g}`);
    }

    // Exemples pour "skyr"
    const [skyr] = await conn.query(`
      SELECT code, product_name, brands, energy_kcal_100g, proteins_100g
      FROM aliments
      WHERE product_name LIKE '%skyr%' AND energy_kcal_100g IS NOT NULL
      LIMIT 5
    `);
    console.log('\n🥛 Exemples "skyr" :');
    for (const r of skyr) {
      console.log(`   - ${r.product_name} (${r.brands || '?'}) : ${r.energy_kcal_100g} kcal, P ${r.proteins_100g}`);
    }

    const [size] = await conn.query(`
      SELECT ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 1) AS size_mb,
             ROUND(DATA_LENGTH / 1024 / 1024, 1) AS data_mb,
             ROUND(INDEX_LENGTH / 1024 / 1024, 1) AS idx_mb
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aliments'
    `);
    if (size[0]) {
      console.log(`\n📊 Taille : ${size[0].size_mb} Mo (data ${size[0].data_mb} + idx ${size[0].idx_mb})`);
    }

    console.log('\n✅ Vérification terminée.');
  } catch (e) {
    console.error('Erreur:', e.message);
  } finally {
    if (conn) await conn.end();
  }
})();

