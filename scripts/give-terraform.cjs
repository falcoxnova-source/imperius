const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

const userId = 'e11e6baa-c599-440c-aaaa-b98008182b4b';
const planetId = '4d373acd-322c-4ea4-8529-9301f13815d9';

(async () => {
  await c.connect();

  // 1. Upgrade energy_tech from 6 to 12
  const r1 = await c.query(`
    UPDATE user_technologies 
    SET level = 12 
    WHERE user_id = $1 AND technology_type_id = 1
    RETURNING level
  `, [userId]);
  console.log('✅ energy_tech upgraded to level', r1.rows[0].level);

  // 2. Add nanite_factory level 1 (building_type_id = 10)
  // First check if it exists
  const existing = await c.query(`
    SELECT id FROM planet_buildings WHERE planet_id = $1 AND building_type_id = 10
  `, [planetId]);
  
  if (existing.rows.length > 0) {
    await c.query(`UPDATE planet_buildings SET level = 1 WHERE planet_id = $1 AND building_type_id = 10`, [planetId]);
    console.log('✅ nanite_factory updated to level 1');
  } else {
    await c.query(`INSERT INTO planet_buildings (planet_id, building_type_id, level) VALUES ($1, 10, 1)`, [planetId]);
    console.log('✅ nanite_factory created at level 1');
  }

  // 3. Add terraformer level 1 (building_type_id = 14)
  const existingTerra = await c.query(`
    SELECT id FROM planet_buildings WHERE planet_id = $1 AND building_type_id = 14
  `, [planetId]);
  
  if (existingTerra.rows.length > 0) {
    await c.query(`UPDATE planet_buildings SET level = 1 WHERE planet_id = $1 AND building_type_id = 14`, [planetId]);
    console.log('✅ terraformer updated to level 1');
  } else {
    await c.query(`INSERT INTO planet_buildings (planet_id, building_type_id, level) VALUES ($1, 14, 1)`, [planetId]);
    console.log('✅ terraformer created at level 1');
  }

  // 4. Update fields_max (+6 for terraformer level 1, OGame formula)
  const planetInfo = await c.query(`SELECT fields_max FROM planets WHERE id = $1`, [planetId]);
  const newFieldsMax = parseInt(planetInfo.rows[0].fields_max) + 6;
  await c.query(`UPDATE planets SET fields_max = $1 WHERE id = $2`, [newFieldsMax, planetId]);
  console.log(`✅ fields_max updated from ${planetInfo.rows[0].fields_max} to ${newFieldsMax} (+6 fields)`);

  // Verify final state
  console.log('\n=== VERIFICATION ===');
  const v1 = await c.query(`
    SELECT tt.code, ut.level FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = $1 AND tt.code = 'energy_tech'
  `, [userId]);
  console.log(`energy_tech = nivel ${v1.rows[0].level}`);

  const v2 = await c.query(`
    SELECT bt.code, pb.level FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = $1 AND bt.code IN ('nanite_factory', 'terraformer')
    ORDER BY bt.code
  `, [planetId]);
  v2.rows.forEach(b => console.log(`${b.code} = nivel ${b.level}`));

  const v3 = await c.query(`SELECT fields_used, fields_max FROM planets WHERE id = $1`, [planetId]);
  console.log(`fields = ${v3.rows[0].fields_used}/${v3.rows[0].fields_max}`);

  await c.end();
})();
