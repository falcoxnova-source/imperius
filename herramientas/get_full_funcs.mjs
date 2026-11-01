import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Get all 3 function definitions using pg_get_functiondef
const funcs = ['secure_add_to_building_queue', 'secure_start_research', 'secure_add_to_shipyard_queue'];
for (const f of funcs) {
  const r = await c.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = $1", [f]);
  if (r.rows.length > 0) {
    const fullDef = r.rows[0].def;
    console.log(fullDef);
    console.log('---END---');
  }
}

await c.end();
