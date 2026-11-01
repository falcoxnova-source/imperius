const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1) secure_add_to_building_queue - check VIP build time bonus
  console.log('=== secure_add_to_building_queue (time calculation section) ===');
  const fn1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_building_queue' LIMIT 1");
  if (fn1.rows.length) {
    const src = fn1.rows[0].prosrc;
    console.log('Contains "plus":', src.includes('plus'));
    console.log('Contains "is_user_plus":', src.includes('is_user_plus'));
    
    // Find build_time calculation
    const btIdx = src.indexOf('build_time');
    if (btIdx > -1) {
      console.log('\nBuild time section:');
      console.log(src.substring(Math.max(0, btIdx - 300), btIdx + 800));
    }
  }

  // 2) Check if ResourcesPage frontend applies VIP bonus to displayed production
  // Already know it checks isUserPlus and applies mineBonusMult += 0.1
  // But the backend calculate_planet_resources does NOT apply it
  // Let me verify: what does the frontend ResourcesPage show vs what the backend calculates?
  
  // 3) Test with a real VIP user - Layonnel from screenshot
  console.log('\n=== VIP Users ===');
  const vipUsers = await c.query(`
    SELECT ps.user_id, pr.username, ps.expires_at
    FROM plus_subscriptions ps
    JOIN profiles pr ON pr.id = ps.user_id
    WHERE ps.is_active = true AND ps.expires_at > now()
    ORDER BY pr.username
  `);
  for (const u of vipUsers.rows) {
    console.log(`  ${u.username}: VIP until ${u.expires_at}`);
  }

  // 4) For a VIP user, compare production with and without 10% bonus
  if (vipUsers.rows.length > 0) {
    const testUser = vipUsers.rows[0];
    console.log(`\n=== Testing production for VIP user: ${testUser.username} ===`);
    
    // Get their homeworld resources
    const planet = await c.query(`
      SELECT p.id, p.name, pr.metal_per_hour, pr.crystal_per_hour, pr.deuterium_per_hour
      FROM planets p
      JOIN planet_resources pr ON pr.planet_id = p.id
      WHERE p.user_id = $1 AND p.is_homeworld = true
    `, [testUser.user_id]);
    
    if (planet.rows.length) {
      const p = planet.rows[0];
      console.log(`  Planet: ${p.name}`);
      console.log(`  Stored metal_per_hour: ${p.metal_per_hour}`);
      console.log(`  Stored crystal_per_hour: ${p.crystal_per_hour}`);
      console.log(`  Stored deuterium_per_hour: ${p.deuterium_per_hour}`);
      
      // Check if they have geologist too
      const hasGeo = await c.query(`
        SELECT 1 FROM user_officers uo
        JOIN officer_types ot ON ot.id = uo.officer_type_id
        WHERE uo.user_id = $1 AND ot.code = 'geologist'
          AND (uo.expires_at IS NULL OR uo.expires_at > now())
      `, [testUser.user_id]);
      console.log(`  Has Geologist: ${hasGeo.rows.length > 0}`);
    }
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
