const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({host:'localhost',port:3306,user:'root',password:'',database:'agoge'});
  const [r] = await c.query("SELECT table_name, table_rows, round(data_length/1024/1024,1) as size_mb FROM information_schema.tables WHERE table_schema='agoge' AND table_name='aliments'");
  console.log(JSON.stringify(r, null, 2));
  await c.end();
})();
