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
  const tables = ['p2p_disputes','p2p_reputation','p2p_orders','p2p_offers','p2p_messages','p2p_audit_log'];
  for (const t of tables) {
    const r = await c.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position",
      [t]
    );
    console.log('====', t);
    r.rows.forEach(x => console.log(' ', x.column_name, x.data_type));
  }
  const cons = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('is_p2p_banned','p2p_banned_until','is_admin','username')"
  );
  console.log('=== profiles flags ===');
  cons.rows.forEach(x => console.log(' ', x.column_name));

  const idx = await c.query(
    "SELECT tablename, indexname FROM pg_indexes WHERE tablename LIKE 'p2p_%' ORDER BY tablename, indexname"
  );
  console.log('=== existing p2p indexes ===');
  idx.rows.forEach(x => console.log(' ', x.tablename, '→', x.indexname));

  const gs = await c.query("SELECT key, value FROM game_settings WHERE key LIKE 'p2p_%' ORDER BY key");
  console.log('=== game_settings p2p_* ===');
  gs.rows.forEach(x => console.log(' ', x.key, '=', x.value));

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
