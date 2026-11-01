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
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='p2p_messages' ORDER BY ordinal_position"
  );
  console.log('--- p2p_messages columns ---');
  cols.rows.forEach((r) => console.log(r));

  const fns = await c.query(
    "SELECT proname FROM pg_proc WHERE proname LIKE 'p2p_%message%' OR proname LIKE 'p2p_%chat%'"
  );
  console.log('--- message-related functions ---');
  fns.rows.forEach((r) => console.log(r.proname));

  const pol = await c.query(
    "SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='p2p_messages'"
  );
  console.log('--- RLS policies on p2p_messages ---');
  pol.rows.forEach((r) => console.log(r));

  const buckets = await c.query("SELECT id, name, public FROM storage.buckets WHERE id LIKE '%p2p%' OR id LIKE '%dispute%' OR id LIKE '%evidence%'");
  console.log('--- storage buckets ---');
  buckets.rows.forEach((r) => console.log(r));

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
