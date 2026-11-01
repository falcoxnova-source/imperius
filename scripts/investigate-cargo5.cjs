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

  // 1) Get FULL process_fleet_arrival source - the deploy section specifically
  console.log('=== DEPLOY SECTION OF process_fleet_arrival ===');
  const funcSrc = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname='public' AND p.proname='process_fleet_arrival'
    LIMIT 1
  `);
  
  if (funcSrc.rows.length) {
    const src = funcSrc.rows[0].def;
    // Find WHEN 'deploy' 
    const deployIdx = src.indexOf("'deploy'", src.indexOf('CASE fleet_record.mission_type'));
    if (deployIdx > -1) {
      const start = Math.max(0, deployIdx - 50);
      const end = Math.min(src.length, deployIdx + 3000);
      console.log(src.substring(start, end));
    } else {
      console.log("'deploy' WHEN case not found in CASE block!");
      // Search for all deploy references
      let idx = 0;
      while ((idx = src.indexOf('deploy', idx)) !== -1) {
        console.log(`\n--- deploy reference at position ${idx} ---`);
        console.log(src.substring(Math.max(0, idx - 100), Math.min(src.length, idx + 200)));
        idx += 6;
      }
    }
  }

  // 2) The specific fleet the client complains about
  // Looking at the data: evening round, Lores 5 → Lores 4
  // Fleet 618ff5de: M:2,521,763 C:349,175 D:2,476,707 at 21:42 → 22:04, completed=true
  // But client says "3M metal, 3M crystal, 4M+ deuterium" - let me check earlier round too
  
  // Get ALL fleets going to position 4 from this user
  console.log('\n=== ALL FLEETS TO POSITION 4 ===');
  const toPos4 = await c.query(`
    SELECT f.id, f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.is_completed, f.is_returning, f.departure_time, f.arrival_time,
           op.name as origin
    FROM fleets f
    LEFT JOIN planets op ON f.origin_planet_id = op.id
    WHERE f.user_id = $1
      AND f.target_position = 4
      AND f.target_galaxy = 3 AND f.target_system = 113
    ORDER BY f.departure_time DESC
    LIMIT 20
  `, [userId]);
  toPos4.rows.forEach(f => {
    console.log(`  ${f.id.substring(0,8)} | ${f.origin} → pos4 | M:${f.cargo_metal} C:${f.cargo_crystal} D:${f.cargo_deuterium} | completed:${f.is_completed} returning:${f.is_returning} | depart:${f.departure_time} arrive:${f.arrival_time}`);
  });

  // 3) Check resource history for Lores 4 planet (id: c3504490...)
  console.log('\n=== RESOURCE HISTORY TABLES ===');
  const histTables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' 
      AND (table_name ILIKE '%resource_log%' OR table_name ILIKE '%resource_hist%' 
           OR table_name ILIKE '%planet_log%' OR table_name ILIKE '%audit%log%'
           OR table_name ILIKE '%transport_interaction%')
  `);
  console.log(histTables.rows.map(r => r.table_name));

  // 4) Check transport_interactions table
  const ti = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND table_name = 'transport_interactions'
  `);
  if (ti.rows.length) {
    console.log('\n=== TRANSPORT INTERACTIONS for this user ===');
    const ticols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='transport_interactions' ORDER BY ordinal_position`);
    console.log('Columns:', ticols.rows.map(r => r.column_name).join(', '));
    
    const tidata = await c.query(`
      SELECT * FROM transport_interactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 15
    `, [userId]);
    tidata.rows.forEach(r => console.log(JSON.stringify(r)));
  }

  // 5) Let's look at planet_resources current state for Lores 4
  console.log('\n=== CURRENT RESOURCES ON LORES 4 ===');
  const lores4res = await c.query(`
    SELECT pr.* FROM planet_resources pr
    JOIN planets p ON p.id = pr.planet_id
    WHERE p.user_id = $1 AND p.position = 4
  `, [userId]);
  console.log(lores4res.rows[0]);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
