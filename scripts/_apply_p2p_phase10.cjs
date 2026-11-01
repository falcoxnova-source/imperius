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
  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260504_p2p_phase10_telegram_notifications.sql');
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

  const cfg = await c.query('SELECT id, edge_function_url, is_enabled, min_amount_fxu_eq FROM p2p_notification_config');
  console.log('config:', cfg.rows);

  const t = await c.query("SELECT tgname FROM pg_trigger WHERE tgname='trg_p2p_offer_notify'");
  console.log('trigger:', t.rows.map((r) => r.tgname).join(', '));

  const f = await c.query("SELECT proname FROM pg_proc WHERE proname IN ('send_p2p_offer_telegram_notification','p2p_offer_after_insert_notify') ORDER BY proname");
  console.log('functions:', f.rows.map((r) => r.proname));

  await c.end();
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
