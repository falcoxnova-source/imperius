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

  const cfg = await c.query(
    "SELECT id, edge_function_url, is_enabled, (anon_key IS NOT NULL) AS has_key FROM market_notification_config"
  );
  console.log('config:', cfg.rows);

  const groups = await c.query(
    "SELECT id, name, chat_id, is_enabled FROM telegram_groups"
  );
  console.log('groups:', groups.rows);

  // Check if function exists that broadcasts to all groups
  const fns = await c.query(
    "SELECT proname FROM pg_proc WHERE proname ILIKE 'send_%telegram%' OR proname ILIKE 'broadcast%telegram%' OR proname ILIKE '%telegram_broadcast%' ORDER BY proname"
  );
  console.log('telegram send functions:', fns.rows.map((r) => r.proname));

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
