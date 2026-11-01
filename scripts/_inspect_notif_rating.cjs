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

  // Notifications tables
  const tabs = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%notif%' OR table_name ILIKE '%inbox%' OR table_name ILIKE '%message%') ORDER BY table_name"
  );
  console.log('--- notification-like tables ---');
  tabs.rows.forEach((r) => console.log(r.table_name));

  for (const name of ['notifications', 'user_notifications', 'p2p_reputation', 'p2p_ratings']) {
    const cols = await c.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
      [name]
    );
    if (cols.rows.length) {
      console.log(`\n--- ${name} ---`);
      cols.rows.forEach((r) => console.log(' ', r.column_name, r.data_type));
    }
  }

  // p2p_release_order function
  const fn = await c.query(
    "SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='p2p_release_order'"
  );
  if (fn.rows[0]) {
    console.log('\n--- p2p_release_order ---');
    console.log(fn.rows[0].def);
  }

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
