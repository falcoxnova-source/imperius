import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const r = await c.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'secure_add_to_building_queue'");
console.log(r.rows[0].def);
await c.end();
