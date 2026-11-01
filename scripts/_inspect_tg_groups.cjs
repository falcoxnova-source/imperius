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

  const cols = await c.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='telegram_groups' ORDER BY ordinal_position"
  );
  console.log('telegram_groups cols:', cols.rows);

  const rows = await c.query('SELECT * FROM telegram_groups LIMIT 3');
  console.log('sample rows:', rows.rows);

  const edge = await c.query("SELECT proname FROM pg_proc WHERE proname LIKE 'notify%' OR proname LIKE 'tg_%' OR proname LIKE 'broadcast%'");
  console.log('functions:', edge.rows.map((r) => r.proname));

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
