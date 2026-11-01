const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND (table_name ILIKE '%withdraw%' OR table_name ILIKE '%payout%' OR table_name ILIKE '%usdt%' OR table_name ILIKE '%cashout%')
     ORDER BY table_name`);
  console.log('withdraw-related tables:', r.rows.map(x => x.table_name));

  for (const t of r.rows) {
    const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t.table_name]);
    console.log(`\n== ${t.table_name} ==`);
    for (const co of cols.rows) console.log(' ', co.column_name, co.data_type);
  }
  await c.end();
})();
