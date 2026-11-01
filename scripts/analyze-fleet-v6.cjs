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

  // 1. All overloads of validate_fleet_mission
  console.log('=== 1. validate_fleet_mission overloads ===');
  const r1 = await c.query(`SELECT p.oid, pg_get_function_arguments(p.oid) as args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE p.proname='validate_fleet_mission' AND n.nspname='public'`);
  r1.rows.forEach(r => console.log(`  (${r.args})`));

  // 2. planets columns
  console.log('\n=== 2. planets columns ===');
  const r2 = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='planets' AND table_schema='public' ORDER BY ordinal_position`);
  r2.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // 3. Bot ships (fixed column name)
  console.log('\n=== 3. Bot ships ===');
  const r3 = await c.query(`
    SELECT pr.username, p.galaxy, p.solar_system, p.position, st.code, ps.quantity
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE pr.is_bot = true AND ps.quantity > 0
    ORDER BY pr.username, st.code LIMIT 40
  `);
  r3.rows.forEach(r => console.log(`  ${r.username} [${r.galaxy}:${r.solar_system}:${r.position}] ${r.code} x${r.quantity}`));

  // 4. Bot resources
  console.log('\n=== 4. Bot resources (5 samples) ===');
  const r4 = await c.query(`
    SELECT pr.username, p.galaxy, p.solar_system, p.position,
      FLOOR(pr2.metal) as metal, FLOOR(pr2.crystal) as crystal, FLOOR(pr2.deuterium) as deut
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    JOIN planet_resources pr2 ON pr2.planet_id = p.id
    WHERE pr.is_bot = true ORDER BY pr.username LIMIT 5
  `);
  r4.rows.forEach(r => console.log(`  ${r.username} [${r.galaxy}:${r.solar_system}:${r.position}] M=${r.metal} C=${r.crystal} D=${r.deut}`));

  // 5. Bot techs (1st bot)
  console.log('\n=== 5. Bot techs ===');
  const r5 = await c.query(`
    SELECT pr.username, tt.code, ut.level
    FROM user_technologies ut
    JOIN profiles pr ON pr.id = ut.user_id
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE pr.is_bot = true
    ORDER BY pr.username, tt.code LIMIT 30
  `);
  r5.rows.forEach(r => console.log(`  ${r.username} ${r.code}=${r.level}`));

  // 6. Non-bot players and their planets (potential targets)
  console.log('\n=== 6. Non-bot players near bots ===');
  const r6 = await c.query(`
    SELECT DISTINCT bp_pr.username as bot, bp.galaxy, bp.solar_system as bot_sys,
      tp.solar_system as t_sys, tp.position as t_pos, tpr.username as target, tpr.points_total
    FROM planets bp
    JOIN profiles bp_pr ON bp_pr.id = bp.user_id AND bp_pr.is_bot = true
    JOIN planets tp ON tp.galaxy = bp.galaxy AND tp.solar_system BETWEEN bp.solar_system-30 AND bp.solar_system+30 AND tp.planet_type='planet'
    JOIN profiles tpr ON tpr.id = tp.user_id AND tpr.is_bot = false
    ORDER BY bp_pr.username LIMIT 20
  `);
  r6.rows.forEach(r => console.log(`  ${r.bot} [${r.galaxy}:${r.bot_sys}] -> ${r.target} [${r.galaxy}:${r.t_sys}:${r.t_pos}] pts=${r.points_total}`));

  // 7. profiles admin column
  console.log('\n=== 7. profiles admin columns ===');
  const r7 = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name LIKE '%admin%'`);
  r7.rows.forEach(r => console.log(`  ${r.column_name}`));

  // 8. check_noob_protection body (brief)
  console.log('\n=== 8. check_noob_protection signature ===');
  const r8 = await c.query(`SELECT pg_get_function_arguments(p.oid) as args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE p.proname='check_noob_protection' AND n.nspname='public'`);
  r8.rows.forEach(r => console.log(`  (${r.args})`));

  // 9. fleet helper function signatures
  console.log('\n=== 9. Fleet calc functions ===');
  const r9 = await c.query(`SELECT proname, pg_get_function_arguments(p.oid) as args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND proname LIKE 'fleet_calc%' ORDER BY proname`);
  r9.rows.forEach(r => console.log(`  ${r.proname}(${r.args})`));

  // 10. has_active_officer function
  console.log('\n=== 10. has_active_officer ===');
  const r10 = await c.query(`SELECT pg_get_function_arguments(p.oid) as args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE p.proname='has_active_officer'`);
  r10.rows.forEach(r => console.log(`  (${r.args})`));

  // 11. is_user_plus function
  console.log('\n=== 11. is_user_plus ===');
  const r11 = await c.query(`SELECT pg_get_function_arguments(p.oid) as args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE p.proname='is_user_plus'`);
  r11.rows.forEach(r => console.log(`  (${r.args})`));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
