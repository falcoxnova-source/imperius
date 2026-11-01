const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();
  const sql = `
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND proname = 'secure_send_fleet'
    ORDER BY 1
  `;
  const r = await c.query(sql);
  console.log(r.rows.map(x => x.signature).join('\n'));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
