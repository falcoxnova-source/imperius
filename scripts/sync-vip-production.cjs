const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Get all planets of VIP users and recalculate their resources
  console.log('=== Syncing all VIP user planets ===');
  const vipPlanets = await c.query(`
    SELECT p.id as planet_id, p.name, pr.username
    FROM plus_subscriptions ps
    JOIN profiles pr ON pr.id = ps.user_id
    JOIN planets p ON p.user_id = ps.user_id
    WHERE ps.is_active = true AND ps.expires_at > now()
    ORDER BY pr.username, p.name
  `);

  console.log(`Found ${vipPlanets.rows.length} planets belonging to VIP users\n`);

  let updated = 0;
  for (const planet of vipPlanets.rows) {
    const result = await c.query("SELECT calculate_planet_resources($1) as r", [planet.planet_id]);
    const r = result.rows[0].r;

    if (r.error) {
      console.log(`  ⚠️ ${planet.username} - ${planet.name}: ${r.error}`);
      continue;
    }

    // Save the recalculated values
    await c.query(`
      UPDATE planet_resources SET
        metal = $2, crystal = $3, deuterium = $4,
        metal_per_hour = $5, crystal_per_hour = $6, deuterium_per_hour = $7,
        energy_used = $8, energy_max = $9,
        metal_storage = $10, crystal_storage = $11, deuterium_storage = $12,
        last_update = now()
      WHERE planet_id = $1
    `, [
      planet.planet_id,
      r.metal, r.crystal, r.deuterium,
      r.metal_per_hour, r.crystal_per_hour, r.deuterium_per_hour,
      r.energy_used, r.energy_max,
      r.metal_storage, r.crystal_storage, r.deuterium_storage
    ]);
    
    console.log(`  ✅ ${planet.username} - ${planet.name}: metal=${r.metal_per_hour}/h, crystal=${r.crystal_per_hour}/h, deut=${r.deuterium_per_hour}/h`);
    updated++;
  }

  console.log(`\n✅ Updated ${updated} planets for VIP users`);
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
