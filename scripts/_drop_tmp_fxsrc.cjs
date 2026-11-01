const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  try {
    await c.query(`DROP TABLE IF EXISTS public._tmp_fxsrc`);
    console.log('Dropped public._tmp_fxsrc (if it existed).');
  } catch (e) {
    console.log('Drop failed:', e.message);
    console.log('Falling back to enabling RLS without policies (locks the table down).');
    await c.query(`ALTER TABLE public._tmp_fxsrc ENABLE ROW LEVEL SECURITY`);
    console.log('RLS enabled on public._tmp_fxsrc.');
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
