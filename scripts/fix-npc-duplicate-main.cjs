const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Find all bots with more than 1 is_main_planet = true
  const dupes = await c.query(`
    SELECT pr.username, COUNT(*) as main_count
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE pr.is_bot = true AND p.is_main_planet = true
    GROUP BY pr.username
    HAVING COUNT(*) > 1
    ORDER BY pr.username
  `);
  console.log(`⚠️ ${dupes.rows.length} bots con DUPLICADOS de is_main_planet=true:`);
  console.table(dupes.rows);

  // Fix: set is_main_planet=false for non-"Planeta Principal" planets
  const fix = await c.query(`
    UPDATE planets p SET is_main_planet = false
    FROM profiles pr
    WHERE p.user_id = pr.id
      AND pr.is_bot = true
      AND p.is_main_planet = true
      AND p.name != 'Planeta Principal'
      AND EXISTS (
        SELECT 1 FROM planets p2 
        WHERE p2.user_id = p.user_id 
        AND p2.name = 'Planeta Principal' 
        AND p2.is_main_planet = true
        AND p2.id != p.id
      )
    RETURNING pr.username, p.name, p.galaxy, p.solar_system, p.position
  `);
  console.log(`\n✅ Corregidos ${fix.rowCount} planetas (is_main_planet → false):`);
  fix.rows.forEach(r => console.log(`   ${r.username}: ${r.name} [${r.galaxy}:${r.solar_system}:${r.position}]`));

  // Verify
  const verify = await c.query(`
    SELECT pr.username, COUNT(*) as main_count
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE pr.is_bot = true AND p.is_main_planet = true
    GROUP BY pr.username
    HAVING COUNT(*) > 1
  `);
  console.log(`\nDespués del fix: ${verify.rows.length} bots con duplicados (debe ser 0)`);

  await c.end();
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
