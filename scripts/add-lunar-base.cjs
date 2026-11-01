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

  // 1. Find user
  const userRes = await c.query(
    `SELECT id, username, email FROM profiles WHERE email = $1`,
    ['makariogp@gmail.com']
  );
  if (userRes.rows.length === 0) { console.error('User not found'); return; }
  const user = userRes.rows[0];
  console.log(`User: ${user.username} (${user.id})`);

  // 2. Find moon at 2:41:14
  const moonRes = await c.query(
    `SELECT id, name, galaxy, solar_system, position, planet_type, fields_max 
     FROM planets 
     WHERE user_id = $1 AND galaxy = 2 AND solar_system = 41 AND position = 14 AND planet_type = 'moon'`,
    [user.id]
  );
  if (moonRes.rows.length === 0) { console.error('No moon at 2:41:14'); return; }
  const moon = moonRes.rows[0];
  console.log(`Moon: "${moon.name}" id=${moon.id} fields_max=${moon.fields_max}`);

  // 3. Find lunar_base building type
  const btRes = await c.query(
    `SELECT id, code, name FROM building_types WHERE code = 'lunar_base'`
  );
  if (btRes.rows.length === 0) { console.error('lunar_base not found in building_types'); return; }
  const bt = btRes.rows[0];
  console.log(`Building: ${bt.name} (id=${bt.id})`);

  // 4. Insert or update lunar_base
  const upsertRes = await c.query(
    `INSERT INTO planet_buildings (planet_id, building_type_id, level)
     VALUES ($1, $2, 1)
     ON CONFLICT (planet_id, building_type_id)
     DO UPDATE SET level = 1
     RETURNING *`,
    [moon.id, bt.id]
  );
  const lbLevel = upsertRes.rows[0].level;
  console.log(`lunar_base = nivel ${lbLevel}`);

  // 5. Update fields_max = 1 + (lunar_base_level * 3)
  const newFieldsMax = 1 + (lbLevel * 3);
  const fmRes = await c.query(
    `UPDATE planets SET fields_max = $1 WHERE id = $2 RETURNING name, fields_max`,
    [newFieldsMax, moon.id]
  );
  console.log(`fields_max actualizado: ${moon.fields_max} -> ${fmRes.rows[0].fields_max}`);

  console.log(`\n✅ Luna "${moon.name}" [2:41:14]: lunar_base=nivel ${lbLevel}, fields_max=${fmRes.rows[0].fields_max}`);

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
