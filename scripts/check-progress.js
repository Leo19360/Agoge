const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({host:'localhost',port:3306,user:'root',password:'',database:'agoge'});
  const [r] = await c.query('SELECT COUNT(*) as n FROM aliments');
  console.log('Total produits:', r[0].n);
  const [r2] = await c.query("SELECT COUNT(*) as n FROM aliments WHERE product_name IS NOT NULL AND product_name != ''");
  console.log('Avec nom:', r2[0].n);
  const [r3] = await c.query("SELECT code,product_name,brands,energy_kcal_100g,proteins_100g,carbohydrates_100g,fat_100g FROM aliments WHERE product_name IS NOT NULL AND product_name != '' ORDER BY RAND() LIMIT 5");
  console.log('Echantillon:', JSON.stringify(r3, null, 2));
  const [r4] = await c.query("SELECT table_rows, round(data_length/1024/1024,1) as size_mb, round(index_length/1024/1024,1) as idx_mb FROM information_schema.tables WHERE table_schema='agoge' AND table_name='aliments'");
  console.log('Stats:', JSON.stringify(r4, null, 2));
  await c.end();
})();
