const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Check the EXACT code for energy technology in the database
  console.log('=== Technology types with "energy" ===');
  const techs = await c.query("SELECT id, code, name FROM technology_types WHERE code ILIKE '%energy%' OR name ILIKE '%energ%'");
  console.log(techs.rows);

  // Check what the SQL function looks for
  console.log('\nThe SQL function uses: tt.code = \'energy_tech\'');
  
  // Check a real user with energy technology
  console.log('\n=== Sample users with energy tech ===');
  const sample = await c.query(`
    SELECT pr.username, ut.level, tt.code, tt.name
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    JOIN profiles pr ON pr.id = ut.user_id
    WHERE tt.code ILIKE '%energy%' AND ut.level > 0
    ORDER BY ut.level DESC
    LIMIT 10
  `);
  for (const r of sample.rows) {
    console.log(`  ${r.username}: ${r.code} (${r.name}) = level ${r.level}`);
  }

  // Test with a specific player to see if the function gets the right value
  // Use Roxy as test
  console.log('\n=== Testing Roxy energy tech ===');
  const roxy = await c.query(`
    SELECT ut.level, tt.code, tt.name
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = 'c6531fc3-0fa5-4293-92fe-8f3604d22bc9'
      AND (tt.code ILIKE '%energy%')
  `);
  console.log('Roxy energy techs:', roxy.rows);

  // Test: what does the function find with 'energy_tech'?
  console.log('\n=== Testing SELECT with code = energy_tech ===');
  const test1 = await c.query(`
    SELECT ut.level, tt.code FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = 'c6531fc3-0fa5-4293-92fe-8f3604d22bc9' AND tt.code = 'energy_tech'
  `);
  console.log('With energy_tech:', test1.rows);

  const test2 = await c.query(`
    SELECT ut.level, tt.code FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = 'c6531fc3-0fa5-4293-92fe-8f3604d22bc9' AND tt.code = 'energy_technology'
  `);
  console.log('With energy_technology:', test2.rows);

  // Now let's do a comparison: calculate energy with and without energy tech for a real planet
  // Get a player with high energy tech and fusion reactor
  console.log('\n=== Player with high energy tech + fusion reactor ===');
  const goodPlayer = await c.query(`
    SELECT pr.username, pr.id as user_id, ut.level as energy_tech_level
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    JOIN profiles pr ON pr.id = ut.user_id
    WHERE tt.code ILIKE '%energy%' AND ut.level >= 5
    ORDER BY ut.level DESC
    LIMIT 5
  `);
  
  for (const p of goodPlayer.rows) {
    const fusion = await c.query(`
      SELECT pb.level, pl.name, pl.id as planet_id, pr2.energy_max, pr2.energy_used,
             pr2.fusion_reactor_percent
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id AND bt.code = 'fusion_reactor'
      JOIN planets pl ON pl.id = pb.planet_id AND pl.user_id = $1
      JOIN planet_resources pr2 ON pr2.planet_id = pl.id
      WHERE pb.level > 0
      ORDER BY pb.level DESC LIMIT 1
    `, [p.user_id]);
    
    if (fusion.rows.length) {
      const f = fusion.rows[0];
      const fusionLv = f.level;
      const eTech = p.energy_tech_level;
      
      // Expected fusion energy WITH energy tech
      const withTech = Math.floor(30 * fusionLv * Math.pow(1.05 + eTech * 0.01, fusionLv));
      // Expected fusion energy WITHOUT energy tech (if bug exists)
      const withoutTech = Math.floor(30 * fusionLv * Math.pow(1.05, fusionLv));
      
      console.log(`  ${p.username}: energy_tech=${eTech}, fusion_lv=${fusionLv}`);
      console.log(`    Expected WITH tech: ${withTech}`);
      console.log(`    Expected WITHOUT tech: ${withoutTech}`);
      console.log(`    Stored energy_max: ${f.energy_max} (includes solar+satellite too)`);
    }
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
