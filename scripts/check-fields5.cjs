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

  // 1. Check terraformer_field_bonus function
  console.log('=== terraformer_field_bonus function ===');
  const { rows: fn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'terraformer_field_bonus'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  if (fn.length > 0) console.log(fn[0].prosrc);

  // 2. Verify math for Kul Tiras
  console.log('\n=== MATH VERIFICATION: Kul Tiras ===');
  console.log('diameter=12890, position=1, terraformer=1');
  const base = Math.floor(Math.pow(12890/1000, 2));
  const posBonus = -30; // position 1
  const terraBonus = Math.floor(5 * Math.pow(1, 1.3));
  console.log(`  base_fields = FLOOR((12890/1000)^2) = ${base}`);
  console.log(`  position_bonus(pos=1) = ${posBonus}`);
  console.log(`  terraformer_bonus(level=1) = FLOOR(5 * 1^1.3) = ${terraBonus}`);
  console.log(`  TOTAL = ${base} + (${posBonus}) + ${terraBonus} = ${base + posBonus + terraBonus}`);
  console.log(`  Actual fields_max = 141 ✓`);

  // 3. Verify Tapa Colonia
  console.log('\n=== MATH VERIFICATION: Tapa Colonia ===');
  console.log('diameter=13252, position=1, terraformer=1');
  const base2 = Math.floor(Math.pow(13252/1000, 2));
  console.log(`  base_fields = FLOOR((13252/1000)^2) = ${base2}`);
  console.log(`  position_bonus(pos=1) = -30`);
  console.log(`  terraformer_bonus(level=1) = ${terraBonus}`);
  console.log(`  TOTAL = ${base2} + (-30) + ${terraBonus} = ${base2 - 30 + terraBonus}`);
  console.log(`  Actual fields_max = 150 ✓`);

  // 4. Check ALL planets at position 1, 2, 3 that have overflow
  console.log('\n=== ALL planets at positions 1-3 (penalty positions) ===');
  const { rows: penaltyPlanets } = await c.query(`
    SELECT p.name, pr.username, p.galaxy, p.solar_system, p.position, 
           p.diameter, p.fields_used, p.fields_max,
           (p.fields_used - p.fields_max) as overflow,
           p.planet_type
    FROM planets p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.user_id IS NOT NULL 
    AND p.position IN (1, 2, 3)
    AND p.planet_type = 'planet'
    ORDER BY p.position, p.fields_used - p.fields_max DESC
    LIMIT 20
  `);
  for (const p of penaltyPlanets) {
    const marker = p.overflow > 0 ? '⚠️ OVERFLOW' : '';
    console.log(`  [pos ${p.position}] ${p.username} "${p.name}" ${p.fields_used}/${p.fields_max} ${marker}`);
  }

  // 5. How many total planets have overflow?
  const { rows: totalOverflow } = await c.query(`
    SELECT COUNT(*) as cnt FROM planets 
    WHERE user_id IS NOT NULL AND fields_used > fields_max AND planet_type = 'planet'
  `);
  console.log(`\n=== Total planets with overflow: ${totalOverflow[0].cnt} ===`);

  // 6. Check if fields_max was ever recalculated recently (any migration that calls calculate_planet_max_fields for all planets)
  console.log('\n=== Checking for bulk recalculation in recent migrations ===');
  const { rows: recentMigrations } = await c.query(`
    SELECT name FROM supabase_migrations.schema_migrations 
    WHERE name > '20260320' 
    ORDER BY name DESC
  `);
  console.log('Recent migrations:');
  for (const m of recentMigrations) {
    console.log(`  ${m.name}`);
  }

  // 7. Check if position bonuses were added in any of these recent migrations
  // Search for 'position_bonus' in recent function changes
  console.log('\n=== When was position_bonus added to calculate_planet_max_fields? ===');
  // We can check if there are any other versions or related functions
  const { rows: posCheck } = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE prosrc LIKE '%position_bonus%'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  for (const f of posCheck) {
    console.log(`  ${f.proname} uses position_bonus`);
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
