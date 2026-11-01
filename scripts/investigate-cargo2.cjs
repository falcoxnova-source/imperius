const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();
  const userId = 'a77c7689-a422-4a7f-8c86-0395c7dcaa2f';

  // 1) Planet columns
  console.log('=== PLANET COLUMNS ===');
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='planets' AND table_schema='public' ORDER BY ordinal_position`);
  console.log(cols.rows.map(x => x.column_name).join(', '));

  // 2) Fleet columns
  console.log('\n=== FLEET COLUMNS ===');
  const fcols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='fleets' AND table_schema='public' ORDER BY ordinal_position`);
  console.log(fcols.rows.map(x => x.column_name).join(', '));

  // 3) Planets (without resource columns since they might be named differently)
  console.log('\n=== PLANETS ===');
  const planets = await c.query(`SELECT id, name, galaxy, solar_system, position, planet_type, is_main_planet, created_at FROM planets WHERE owner_id = $1 ORDER BY is_main_planet DESC, created_at ASC`, [userId]);
  planets.rows.forEach((p, i) => {
    console.log(`  [${i}] ${p.name} [${p.galaxy}:${p.solar_system}:${p.position}] ${p.is_main_planet ? '(MAIN)' : '(colony)'} type:${p.planet_type}`);
  });

  // 4) Fleet-related tables
  console.log('\n=== FLEET-RELATED TABLES ===');
  const tables = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%fleet%' OR table_name ILIKE '%mission%' OR table_name ILIKE '%resource%log%') ORDER BY table_name`);
  console.log(tables.rows.map(r => r.table_name));

  // 5) Recent fleets - ALL of them in last 3 days
  console.log('\n=== ALL RECENT FLEETS (last 3 days) ===');
  const fleets = await c.query(`
    SELECT f.*,
           sp.name as source_name, sp.galaxy as sg, sp.solar_system as ss, sp.position as spos,
           tp.name as target_name, tp.galaxy as tg, tp.solar_system as ts, tp.position as tpos
    FROM fleets f
    LEFT JOIN planets sp ON f.source_planet_id = sp.id
    LEFT JOIN planets tp ON f.target_planet_id = tp.id
    WHERE f.user_id = $1
      AND f.departure_time >= NOW() - INTERVAL '3 days'
    ORDER BY f.departure_time DESC
    LIMIT 30
  `, [userId]);
  
  console.log(`Found ${fleets.rows.length} fleets`);
  fleets.rows.forEach(f => {
    const keys = Object.keys(f).filter(k => !['id','user_id','source_planet_id','target_planet_id','created_at','updated_at'].includes(k));
    console.log(`\n--- Fleet ${f.id.substring(0,8)} ---`);
    keys.forEach(k => {
      const v = f[k];
      if (v !== null && v !== undefined && v !== false && v !== 0) {
        console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    });
  });

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
