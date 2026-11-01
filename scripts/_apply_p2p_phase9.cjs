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
  console.log('✓ Connected');
  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260503_p2p_phase9_rating_notifications.sql');
  const sql = fs.readFileSync(file, 'utf8');
  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Migration applied');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }

  const t = await c.query(
    "SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_p2p_rating_update_reputation','trg_p2p_notify_on_order_create','trg_p2p_notify_on_status_change') ORDER BY tgname"
  );
  console.log('Triggers:', t.rows.map((r) => r.tgname).join(', '));

  const f = await c.query(
    "SELECT proname FROM pg_proc WHERE proname IN ('p2p_rate_order','p2p_rating_update_reputation','p2p_notify_on_order_create','p2p_notify_on_status_change') ORDER BY proname"
  );
  console.log('Functions:', f.rows.map((r) => r.proname).join(', '));

  const tbl = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='p2p_ratings' ORDER BY ordinal_position"
  );
  console.log('p2p_ratings cols:', tbl.rows.map((r) => r.column_name).join(', '));

  await c.end();
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
