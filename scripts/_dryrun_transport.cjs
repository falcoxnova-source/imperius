const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();

  // Simular el transport que haría Phase H para Kepler → Principal
  // Sin cometer, sólo dry-run
  const KEPLER = '5d4e90f4-5d51-4ec4-8bde-0d6d483f77b6';

  // IDs de naves
  const st = await c.query(`SELECT id, code FROM ship_types WHERE code IN ('small_cargo','large_cargo')`);
  const smId = st.rows.find(r=>r.code==='small_cargo').id;
  const lgId = st.rows.find(r=>r.code==='large_cargo').id;
  console.log('IDs:', {smId, lgId});

  // Cuántos cargueros tiene Kepler
  const ps = await c.query(`SELECT ship_type_id, quantity FROM planet_ships WHERE planet_id=$1 AND ship_type_id IN ($2,$3)`, [KEPLER, smId, lgId]);
  console.log('Cargueros Kepler:', ps.rows);

  // Llamada real: forzamos TX y rollback
  await c.query('BEGIN');
  try {
    const r = await c.query(`
      SELECT secure_send_fleet(
        p_origin_planet_id := $1::uuid,
        p_target_galaxy := 3,
        p_target_system := 2,
        p_target_position := 12,
        p_mission_type := 'transport',
        p_fleet_ships := jsonb_build_array(
          jsonb_build_object('ship_type_id', $2::int, 'quantity', 524),
          jsonb_build_object('ship_type_id', $3::int, 'quantity', 366)
        ),
        p_cargo_metal := 80000,
        p_cargo_crystal := 40000,
          p_cargo_deuterium := 0,
        p_speed_percent := 100,
        p_target_type := 'planet',
        p_override_user_id := '50da268b-d729-4f06-b8af-e03aa0437c1f'::uuid
      ) AS result
    `, [KEPLER, smId, lgId]);
    console.log('secure_send_fleet result:', JSON.stringify(r.rows[0].result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
  await c.query('ROLLBACK');
  console.log('(rollback aplicado, cambios revertidos)');

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
