const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await c.connect();

  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260505_p2p_phase12_offer_expiration_24h.sql');
  const sql = fs.readFileSync(file, 'utf8');

  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Migration applied: phase12');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }

  const fn = await c.query("SELECT proname FROM pg_proc WHERE proname = 'p2p_expire_stale_offers'");
  const col = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='p2p_offers' AND column_name='expires_at'");
  console.log('function:', fn.rows.map((r) => r.proname).join(','));
  console.log('column:', col.rows.map((r) => r.column_name).join(','));

  await c.end();
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
