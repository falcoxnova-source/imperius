const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // 1. secure_send_fleet full body
  console.log('=== 1. secure_send_fleet FULL BODY ===');
  const r1 = await c.query(`SELECT pg_get_functiondef(p.oid) as def FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = 'secure_send_fleet' AND n.nspname = 'public'`);
  if (r1.rows.length > 0) console.log(r1.rows[0].def);
  else console.log('NOT FOUND');

  // 2. validate_fleet_mission body
  console.log('\n=== 2. validate_fleet_mission BODY ===');
  const r2 = await c.query(`SELECT pg_get_functiondef(p.oid) as def FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = 'validate_fleet_mission' AND n.nspname = 'public'`);
  if (r2.rows.length > 0) console.log(r2.rows[0].def);

  // 3. Bot ships
  console.log('\n=== 3. Bot ships ===');
  const r3 = await c.query(`
    SELECT pr.username, p.galaxy, p.system, p.position, st.code, ps.quantity
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE pr.is_bot = true AND ps.quantity > 0
    ORDER BY pr.username, st.code LIMIT 40
  `);
  r3.rows.forEach(r => console.log(`  ${r.username} [${r.galaxy}:${r.system}:${r.position}] ${r.code} x${r.quantity}`));

  // 4. Bot resources (3 samples)
  console.log('\n=== 4. Bot resources ===');
  const r4 = await c.query(`
    SELECT pr.username, p.galaxy, p.system, p.position, 
      FLOOR(pr2.metal) as metal, FLOOR(pr2.crystal) as crystal, FLOOR(pr2.deuterium) as deut
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    JOIN planet_resources pr2 ON pr2.planet_id = p.id
    WHERE pr.is_bot = true
    ORDER BY pr.username LIMIT 5
  `);
  r4.rows.forEach(r => console.log(`  ${r.username} [${r.galaxy}:${r.system}:${r.position}] M=${r.metal} C=${r.crystal} D=${r.deut}`));

  // 5. Bot techs (1st bot)
  console.log('\n=== 5. Bot techs (1st bot) ===');
  const r5 = await c.query(`
    SELECT pr.username, tt.code, ut.level, ut.is_researching
    FROM user_technologies ut
    JOIN profiles pr ON pr.id = ut.user_id
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE pr.is_bot = true
    ORDER BY pr.username, tt.code LIMIT 30
  `);
  r5.rows.forEach(r => console.log(`  ${r.username} ${r.code}=${r.level}${r.is_researching?' RESEARCHING':''}`));

  // 6. profiles.is_admin column check
  console.log('\n=== 6. profiles admin columns ===');
  const r6 = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name LIKE '%admin%'`);
  r6.rows.forEach(r => console.log(`  ${r.column_name}`));

  // 7. Non-bot players near bots
  console.log('\n=== 7. Non-bot planets near bots ===');
  const r7 = await c.query(`
    SELECT bp_pr.username as bot, bp.galaxy, bp.system,
      tp.system as t_sys, tp.position as t_pos, tpr.username as target, tpr.points_total
    FROM planets bp
    JOIN profiles bp_pr ON bp_pr.id = bp.user_id AND bp_pr.is_bot = true
    JOIN planets tp ON tp.galaxy = bp.galaxy AND tp.system BETWEEN bp.system - 30 AND bp.system + 30 AND tp.planet_type = 'planet'
    JOIN profiles tpr ON tpr.id = tp.user_id AND tpr.is_bot = false
    ORDER BY bp_pr.username LIMIT 20
  `);
  r7.rows.forEach(r => console.log(`  Bot ${r.bot} [${r.galaxy}:${r.system}] -> ${r.target} [${r.galaxy}:${r.t_sys}:${r.t_pos}] pts=${r.points_total}`));

  // 8. Ship types full
  console.log('\n=== 8. ship_types ===');
  const r8 = await c.query(`SELECT id, code, base_speed, fuel_consumption, cargo_capacity FROM ship_types ORDER BY id`);
  r8.rows.forEach(r => console.log(`  ${r.id} ${r.code} spd=${r.base_speed} fuel=${r.fuel_consumption} cargo=${r.cargo_capacity}`));

  // 9. fleet helper functions
  console.log('\n=== 9. Fleet helper functions ===');
  const r9 = await c.query(`SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND proname LIKE '%fleet%' ORDER BY proname`);
  r9.rows.forEach(r => console.log(`  ${r.proname}`));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
