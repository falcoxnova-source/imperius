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

  // 1) Get process_fleet_arrival source - the deploy section
  console.log('=== PROCESS_FLEET_ARRIVAL SOURCE (deploy section) ===');
  const funcSrc = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname='public' AND p.proname='process_fleet_arrival'
    LIMIT 1
  `);
  
  if (funcSrc.rows.length) {
    const src = funcSrc.rows[0].def;
    // Find the deploy section
    const deployIdx = src.indexOf('deploy');
    if (deployIdx > -1) {
      // Get surrounding context (2000 chars before and after)
      const start = Math.max(0, deployIdx - 500);
      const end = Math.min(src.length, deployIdx + 3000);
      console.log(src.substring(start, end));
    } else {
      console.log('No deploy section found, printing first 5000 chars...');
      console.log(src.substring(0, 5000));
    }
  }

  // 2) Specifically look at fleet 618ff5de - Lores 5 → Lores 4 
  // The client says this one lost resources
  console.log('\n=== FLEET 618ff5de DETAIL (Lores 5 → colony 4) ===');
  const fleet = await c.query(`
    SELECT f.*, 
           op.name as origin_name,
           (SELECT json_agg(json_build_object('ship_type_id', fs.ship_type_id, 'quantity', fs.quantity, 'name', st.name))
            FROM fleet_ships fs 
            LEFT JOIN ship_types st ON fs.ship_type_id = st.id 
            WHERE fs.fleet_id = f.id) as ships_detail
    FROM fleets f
    LEFT JOIN planets op ON f.origin_planet_id = op.id
    WHERE f.id = '618ff5de-3e30-4be5-b2ce-c6f04f9ead80'
       OR f.id LIKE '618ff5de%'
  `);
  if (fleet.rows.length) {
    console.log(JSON.stringify(fleet.rows[0], null, 2));
  } else {
    // Try the second round: Lores 5 → Lores 4 around 21:42
    console.log('Not found by prefix, searching by route...');
    const f2 = await c.query(`
      SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
             f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
             f.departure_time, f.arrival_time, f.return_time,
             op.name as origin
      FROM fleets f
      LEFT JOIN planets op ON f.origin_planet_id = op.id
      WHERE f.user_id = $1
        AND f.target_galaxy = 3 AND f.target_system = 113 AND f.target_position = 4
        AND f.departure_time >= '2026-04-03'
      ORDER BY f.departure_time DESC
    `, [userId]);
    console.log('Fleets to position 4:');
    f2.rows.forEach(r => console.log(JSON.stringify(r)));
  }

  // 3) Check what happened in the SECOND round (evening) - the one the client is complaining about
  // The client says: sent from colony 5 to colony 4 with 3M+ metal, 3M+ crystal, 4M+ deuterium
  // Looking at the data: Fleet 618ff5de has M:2.5M C:349K D:2.4M - doesn't match exactly
  // Let's look more carefully at all colony5→colony4 movements
  console.log('\n=== ALL FLEETS FROM POS 5 TO POS 4 ===');
  const c5to4 = await c.query(`
    SELECT f.id, f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.is_completed, f.is_returning, f.departure_time, f.arrival_time
    FROM fleets f
    WHERE f.user_id = $1
      AND f.origin_planet_id = 'c3935ccf-b36d-4fd6-9a5a-3a14ab7df920'
      AND f.target_position = 4
    ORDER BY f.departure_time DESC
    LIMIT 10
  `, [userId]);
  // The planet_id might be wrong, let me use exact id
  console.log('From col5 to pos4 (might not find if planet id wrong)');
  console.log(c5to4.rows);

  // Let me get correct planet IDs
  const pids = await c.query(`SELECT id, name, position FROM planets WHERE user_id = $1`, [userId]);
  console.log('\nPlanet IDs:');
  pids.rows.forEach(p => console.log(`  ${p.name} pos:${p.position} id:${p.id}`));

  // 4) Check transport_logs if exists
  console.log('\n=== TRANSPORT INTERACTION LOGS ===');
  const logTables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' 
      AND (table_name ILIKE '%transport%' OR table_name ILIKE '%fleet_log%' OR table_name ILIKE '%interaction%')
  `);
  console.log('Tables:', logTables.rows.map(r => r.table_name));

  for (const t of logTables.rows) {
    const logCols = await c.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND table_schema='public' ORDER BY ordinal_position
    `, [t.table_name]);
    console.log(`\n${t.table_name} columns:`, logCols.rows.map(r => r.column_name).join(', '));
    
    // Check for this user's logs
    try {
      const logs = await c.query(`
        SELECT * FROM ${t.table_name} 
        WHERE user_id = $1 
          AND created_at >= '2026-04-03'
        ORDER BY created_at DESC 
        LIMIT 10
      `, [userId]);
      console.log(`${t.table_name} recent entries:`, logs.rows.length);
      logs.rows.forEach(l => console.log(JSON.stringify(l)));
    } catch(e) {
      console.log(`Error querying ${t.table_name}:`, e.message);
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
