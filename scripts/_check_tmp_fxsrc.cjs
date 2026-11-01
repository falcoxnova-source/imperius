const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query(`SELECT n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relname ILIKE '%tmp%'`);
  console.log('public tmp:', r.rows);
  const r2 = await c.query(`SELECT n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE c.relname='_tmp_fxsrc'`);
  console.log('exact:', r2.rows);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
