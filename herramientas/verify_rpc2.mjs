import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const r = await c.query("SELECT p.oid, p.proname, pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'admin_update_ship_blueprint' ORDER BY p.oid");
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
