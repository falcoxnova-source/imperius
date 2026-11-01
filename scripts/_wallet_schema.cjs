const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  for (const t of ['wallet_transactions','market_transactions','user_wallets']) {
    const cols = await c.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name=$1 AND table_schema='public' ORDER BY ordinal_position`, [t]);
    console.log(`\n== ${t} ==`);
    for (const c2 of cols.rows) console.log(' ', c2.column_name, c2.data_type);
  }
  // sample
  const s = await c.query(`SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT 3`);
  console.log('\nsample wallet_transactions:', s.rows);
  await c.end();
})();
