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

  const mainPlanetId = '8e18ccae-caf4-400a-be01-b884eae96090'; // [1:332:13]

  // 1. Check current value
  console.log('=== BEFORE ===');
  const before = await c.query(`
    SELECT ps.quantity, st.code
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = $1 AND ps.ship_type_id = 2
  `, [mainPlanetId]);
  console.log('large_cargo on [1:332:13]:', before.rows.length > 0 ? before.rows[0].quantity : 'NO ROW');

  // 2. Restore 160 large_cargo
  console.log('\n=== RESTORING 160 LARGE_CARGO ===');
  const result = await c.query(`
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES ($1, 2, 160)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = 160
    RETURNING planet_id, ship_type_id, quantity
  `, [mainPlanetId]);
  console.log('✅ Result:', JSON.stringify(result.rows[0]));

  // 3. Verify
  console.log('\n=== AFTER - VERIFICATION ===');
  const after = await c.query(`
    SELECT ps.quantity, st.code, st.name,
           p.galaxy || ':' || p.solar_system || ':' || p.position as coords, p.name as planet_name
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    JOIN planets p ON p.id = ps.planet_id
    WHERE ps.planet_id = $1 AND ps.ship_type_id = 2
  `, [mainPlanetId]);
  console.log('✅ Verified:', JSON.stringify(after.rows[0], null, 2));

  // 4. Show full inventory
  console.log('\n=== FULL INVENTORY [1:332:13] ===');
  const inv = await c.query(`
    SELECT st.code, st.name, ps.quantity
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = $1 AND ps.quantity > 0
    ORDER BY st.code
  `, [mainPlanetId]);
  for (const r of inv.rows) {
    console.log(`  ${r.name} (${r.code}): ${r.quantity}`);
  }

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
