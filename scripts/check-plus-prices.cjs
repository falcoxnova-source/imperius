const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  const r = await c.query("SELECT code, name, price_usdt, price_fxu, duration_months, is_active FROM plus_plans ORDER BY duration_months");
  console.log('=== PLUS PLANS (produccion) ===');
  for (const p of r.rows) {
    console.log(`  ${p.name} (${p.code}): $${p.price_usdt} USDT / ${p.price_fxu} FXU → ${p.duration_months} mes(es) | active: ${p.is_active}`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
