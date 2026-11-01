const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  console.log('=== BUILDING TYPES ===');
  const bt = await c.query('SELECT id, code, base_metal, base_crystal, base_deuterium, cost_factor FROM building_types ORDER BY id');
  bt.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== TECHNOLOGY TYPES ===');
  const tt = await c.query('SELECT id, code, base_metal, base_crystal, base_deuterium, cost_factor, max_level FROM technology_types ORDER BY id');
  tt.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== SHIP TYPES ===');
  const st = await c.query('SELECT id, code, metal_cost, crystal_cost, deuterium_cost, cargo_capacity FROM ship_types ORDER BY id');
  st.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== DEFENSE TYPES ===');
  const dt = await c.query('SELECT id, code, metal_cost, crystal_cost, deuterium_cost, max_per_planet FROM defense_types ORDER BY id');
  dt.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== OCCUPIED POSITIONS (sample) ===');
  const op = await c.query('SELECT galaxy, solar_system, position FROM planets WHERE planet_type=\'planet\' AND NOT is_destroyed ORDER BY galaxy, solar_system, position LIMIT 20');
  op.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== TOTAL PLANETS PER GALAXY ===');
  const pg = await c.query('SELECT galaxy, COUNT(*) as cnt FROM planets WHERE NOT is_destroyed GROUP BY galaxy ORDER BY galaxy');
  pg.rows.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== MAX SOLAR SYSTEMS ===');
  const ms = await c.query('SELECT galaxy, MAX(solar_system) as max_ss FROM planets GROUP BY galaxy ORDER BY galaxy');
  ms.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check profiles table structure for required fields
  console.log('\n=== PROFILES COLUMNS ===');
  const pc = await c.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='profiles' AND table_schema='public' ORDER BY ordinal_position");
  pc.rows.forEach(r => console.log(r.column_name + ' | ' + r.data_type + ' | null=' + r.is_nullable + ' | default=' + (r.column_default||'none')));

  await c.end();
}
main().catch(console.error);
