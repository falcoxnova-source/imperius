// Replicar EXACTO lo que envía Phase H desde Andrómeda para ver por qué rechaza
const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  await c.query('BEGIN');
  try {
    const r = await c.query(`
      SELECT secure_send_fleet(
        p_origin_planet_id := '7d506b35-745c-45c1-8722-26642245ede3'::uuid,
        p_target_galaxy := 2, p_target_system := 22, p_target_position := 5,
        p_mission_type := 'transport',
        p_fleet_ships := jsonb_build_array(
          jsonb_build_object('ship_type_id', 1, 'quantity', 99),
          jsonb_build_object('ship_type_id', 2, 'quantity', 100)
        ),
        p_cargo_metal := 315682,
        p_cargo_crystal := 431720,
        p_cargo_deuterium := 0,
        p_speed_percent := 100,
        p_target_type := 'planet',
        p_override_user_id := '9700c4e0-d0e4-4efa-baf7-e9cb97945b16'::uuid
      ) AS r
    `);
    console.log('Result:', JSON.stringify(r.rows[0].r, null, 2));
  } catch(e) { console.log('ERR:', e.message); }
  await c.query('ROLLBACK');

  // Probar con cargos más pequeños
  console.log('\n--- Test cargos más pequeños ---');
  for (const [m, cr] of [[100000,100000],[200000,200000],[300000,300000],[315000,430000]]) {
    await c.query('BEGIN');
    try {
      const r = await c.query(`
        SELECT secure_send_fleet(
          p_origin_planet_id := '7d506b35-745c-45c1-8722-26642245ede3'::uuid,
          p_target_galaxy := 2, p_target_system := 22, p_target_position := 5,
          p_mission_type := 'transport',
          p_fleet_ships := jsonb_build_array(
            jsonb_build_object('ship_type_id', 1, 'quantity', 99),
            jsonb_build_object('ship_type_id', 2, 'quantity', 100)
          ),
          p_cargo_metal := $1, p_cargo_crystal := $2, p_cargo_deuterium := 0,
          p_speed_percent := 100, p_target_type := 'planet',
          p_override_user_id := '9700c4e0-d0e4-4efa-baf7-e9cb97945b16'::uuid
        ) AS r
      `, [m, cr]);
      const x = r.rows[0].r;
      console.log(`m=${m} c=${cr}:`, x.success ? `OK fuel=${x.fuel_consumption}` : x.error);
    } catch(e) { console.log(`m=${m} c=${cr}:`, e.message); }
    await c.query('ROLLBACK');
  }

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
