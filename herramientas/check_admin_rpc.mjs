import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const r = await c.query("SELECT proname, prosrc FROM pg_proc WHERE proname = 'is_current_user_admin'");
console.log(JSON.stringify(r.rows.map(x => ({ name: x.proname, src: (x.prosrc || '').substring(0, 200) })), null, 2));

await c.end();
