const { Client } = require('pg');
const cfg = { host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}};
(async () => {
  const c = new Client(cfg); await c.connect();
  const r = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name='referral_commissions' ORDER BY ordinal_position
  `);
  console.table(r.rows);
  const r2 = await c.query(`SELECT * FROM referral_commissions ORDER BY created_at DESC LIMIT 2`);
  console.log('samples:'); console.log(r2.rows);
  await c.end();
})();
