const { Client } = require('pg');
const cfg = { host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false } };
(async () => {
  const c = new Client(cfg); await c.connect();
  for (const t of ['wallet_transactions','user_wallets','wallet_config']) {
    const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t]);
    console.log(`\n=== ${t} ===`);
    r.rows.forEach(x => console.log(`  ${x.column_name} ${x.data_type}`));
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
