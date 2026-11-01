import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const r = await c.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'secure_add_to_building_queue'");
let def = r.rows[0].def;
console.log('Before fix - has is_moon:', def.includes('is_moon'));

def = def.replace(/COALESCE\(v_planet\.is_moon, false\)/g, "v_planet.planet_type = 'moon'");
console.log('After fix - has is_moon:', def.includes('is_moon'));

await c.query(def);
console.log('secure_add_to_building_queue patched successfully');

await c.end();
