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
  // Look for places bot token might be stored
  const tabs = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%bot%' OR table_name ILIKE '%config%' OR table_name ILIKE '%secret%') ORDER BY table_name"
  );
  console.log('candidate tables:', tabs.rows.map((r) => r.table_name));

  // market_notification_config full
  const mcfg = await c.query('SELECT * FROM market_notification_config');
  console.log('market_notification_config:', mcfg.rows);

  // Check for a telegram_bot_config or similar
  for (const name of ['telegram_bot_config', 'bot_config', 'telegram_config']) {
    try {
      const r = await c.query(`SELECT * FROM ${name} LIMIT 1`);
      console.log(`${name}:`, r.rows);
    } catch { /* ignore */ }
  }

  // game_settings keys with 'telegram' or 'bot'
  const s = await c.query(
    "SELECT key, left(value, 40) AS v FROM game_settings WHERE key ILIKE '%telegram%' OR key ILIKE '%bot%' OR key ILIKE '%tg_%' ORDER BY key"
  );
  console.log('settings:', s.rows);

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
