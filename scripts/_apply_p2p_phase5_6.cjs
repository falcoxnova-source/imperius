const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const files = [
    'supabase/migrations/20260429_p2p_phase5_antifraud.sql',
    'supabase/migrations/20260430_p2p_phase6_indexes_health.sql',
  ];
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

  for (const f of files) {
    const sql = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    console.log('→ Applying', f);
    await c.query(sql);
    console.log('  ✓ done');
  }

  // Verificaciones
  const r1 = await c.query(`SELECT COUNT(*) FROM pg_trigger WHERE tgname IN ('trg_p2p_enforce_order_limits','trg_p2p_autoban_on_dispute')`);
  console.log('Triggers instalados:', r1.rows[0].count);

  const r2 = await c.query(`SELECT proname FROM pg_proc WHERE proname IN ('get_p2p_admin_disputes','get_p2p_user_reputation','get_p2p_reputations_for_users','get_p2p_health_metrics')`);
  console.log('Funciones:', r2.rows.map(x => x.proname).join(', '));

  const r3 = await c.query(`SELECT key, value FROM game_settings WHERE key IN ('p2p_max_open_orders_per_user','p2p_max_daily_volume_fxu','p2p_autoban_lost_disputes_7d') ORDER BY key`);
  console.log('Settings:');
  r3.rows.forEach(x => console.log(' ', x.key, '=', x.value));

  const r4 = await c.query(`SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_p2p%status%' OR indexname LIKE 'idx_p2p%opened%' OR indexname = 'idx_admin_revenue_p2p_fee' ORDER BY indexname`);
  console.log('Índices nuevos:', r4.rows.map(x => x.indexname).join(', '));

  const r5 = await c.query(`SELECT get_p2p_health_metrics() AS m`);
  console.log('Health metrics sample:', JSON.stringify(r5.rows[0].m));

  await c.end();
  console.log('✓ All done');
})().catch(e => { console.error('✗', e.message); process.exit(1); });
