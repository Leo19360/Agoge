const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({host:'localhost',port:3306,user:'root',password:''});
  const [r] = await c.query('SHOW DATABASES');
  console.log('Bases MySQL présentes :');
  for (const row of r) console.log(' -', row.Database);
  await c.end();
})();
