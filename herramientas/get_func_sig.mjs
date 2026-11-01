import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const r = await c.query("SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'calculate_planet_resources' AND pg_get_function_result(oid) = 'jsonb'");
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
