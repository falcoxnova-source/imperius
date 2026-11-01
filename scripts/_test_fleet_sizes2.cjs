const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  // Probar con flotas más grandes (small+large combinados)
  for (const cfg of [
    {sm:524, lg:366, lbl:'524s+366l'},
    {sm:400, lg:300, lbl:'400s+300l'},
    {sm:300, lg:200, lbl:'300s+200l'},
    {sm:200, lg:150, lbl:'200s+150l'},
    {sm:150, lg:100, lbl:'150s+100l'},
    {sm:100, lg:100, lbl:'100s+100l'},
    {sm:50, lg:50, lbl:'50s+50l'},
  ]) {
    await c.query('BEGIN');
    try {
      const r = await c.query(`
        SELECT secure_send_fleet(
          p_origin_planet_id := '5d4e90f4-5d51-4ec4-8bde-0d6d483f77b6'::uuid,
          p_target_galaxy := 3, p_target_system := 2, p_target_position := 12,
          p_mission_type := 'transport',
          p_fleet_ships := jsonb_build_array(
            jsonb_build_object('ship_type_id', 1, 'quantity', $1::int),
            jsonb_build_object('ship_type_id', 2, 'quantity', $2::int)
          ),
          p_cargo_metal := 1000, p_cargo_crystal := 1000, p_cargo_deuterium := 0,
          p_speed_percent := 100, p_target_type := 'planet',
          p_override_user_id := '50da268b-d729-4f06-b8af-e03aa0437c1f'::uuid
        ) AS r
      `, [cfg.sm, cfg.lg]);
      const x = r.rows[0].r;
      console.log(cfg.lbl, x.success ? `OK fuel=${x.fuel_consumption}` : `FAIL: ${x.error}`);
    } catch (e) {
      console.log(cfg.lbl, 'ERR:', e.message);
    }
    await c.query('ROLLBACK');
  }
  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
