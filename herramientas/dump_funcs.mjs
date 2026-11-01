import pg from 'pg';
import fs from 'fs';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const funcs = ['secure_add_to_building_queue', 'secure_start_research', 'secure_add_to_shipyard_queue'];
for (const f of funcs) {
  const r = await c.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = $1", [f]);
  const def = r.rows[0]?.def || 'NOT FOUND';
  fs.writeFileSync(`D:\\Falco-Xnova Bolt Supabase\\func_${f}.sql`, def, 'utf8');
  console.log(`func_${f}.sql written (${def.length} chars)`);
}

await c.end();
