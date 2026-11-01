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
  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260501_p2p_phase7_hardening.sql');
  const sql = fs.readFileSync(file, 'utf8');
  console.log('→ Applying', path.basename(file), `(${sql.length} chars)`);
  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Applied');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }

  // Verifications
  const s = await c.query(
    "SELECT key, value FROM game_settings WHERE key IN ('p2p_max_daily_volume_fxu','p2p_dispute_cooldown_minutes','p2p_max_open_orders_per_user') ORDER BY key"
  );
  console.log('Settings:', s.rows.map((r) => `${r.key}=${r.value}`).join(', '));

  const f = await c.query(
    "SELECT proname FROM pg_proc WHERE proname IN ('p2p_enforce_order_limits','p2p_open_dispute') ORDER BY proname"
  );
  console.log('Functions:', f.rows.map((r) => r.proname).join(', '));

  const t = await c.query(
    "SELECT tgname FROM pg_trigger WHERE tgname = 'trg_p2p_enforce_order_limits'"
  );
  console.log('Trigger instalado:', t.rows.map((r) => r.tgname).join(', ') || '(ninguno)');

  await c.end();
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
