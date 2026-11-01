import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

console.log('=== 1. Estructura de daily_missions ===');
const missions = await c.query("SELECT id, code, mission_type, target_count, reward_type, reward_value, reward_duration_hours FROM daily_missions ORDER BY id");
console.log(missions.rows.map(r => `${r.id}. ${r.code} (${r.mission_type}): ${r.target_count} → ${r.reward_type} ${r.reward_value}% ${r.reward_duration_hours}h`).join('\n'));

console.log('\n=== 2. Funciones y GRANTS a authenticated ===');
const funcs = await c.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('get_user_daily_missions','claim_daily_mission_reward','assign_daily_missions','update_daily_mission_progress','get_user_daily_mission_production_bonus') ORDER BY p.proname");
const gr = await c.query("SELECT grantee, routine_name, privilege_type FROM information_schema.routine_privileges WHERE routine_name IN ('get_user_daily_missions','claim_daily_mission_reward','assign_daily_missions','update_daily_mission_progress','get_user_daily_mission_production_bonus') AND grantee = 'authenticated'");
console.log('Funciones encontradas:', funcs.rows.length);
console.log('Grants a authenticated:', gr.rows.length);
gr.rows.forEach(r => console.log(`  ${r.routine_name}: ${r.privilege_type}`));

console.log('\n=== 3. ON CONFLICT en assign_daily_missions ===');
const assignFn = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'assign_daily_missions'");
console.log('Tiene ON CONFLICT:', assignFn.rows[0].prosrc.includes('ON CONFLICT') ? 'SI' : 'NO');

console.log('\n=== 4. Triggers activos ===');
const triggers = await c.query(`
  SELECT trigger_name, event_object_table, event_manipulation, action_timing
  FROM information_schema.triggers
  WHERE trigger_name LIKE '%daily_mission%'
  ORDER BY event_object_table
`);
triggers.rows.forEach(r => console.log(`  ${r.trigger_name}: ${r.action_timing} ${r.event_manipulation} ON ${r.event_object_table}`));

console.log('\n=== 5. update_daily_mission_progress(mission_types) ===');
const updFn = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'update_daily_mission_progress'");
const types = updFn.rows[0].prosrc.match(/mission_type IN \(([^)]+)\)/);
console.log('Mission types tracked:', types ? types[1] : 'All types (no filter)');

console.log('\n=== 6. Production bonus en calculate_planet_resources ===');
const calcFn = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'calculate_planet_resources'");
console.log('Tiene bonus misiones:', calcFn.rows[0].prosrc.includes('get_user_daily_mission_production_bonus') ? 'SI' : 'NO');

console.log('\n=== 7. Revisar si hay usuarios con misiones asignadas ===');
const userMissions = await c.query("SELECT COUNT(DISTINCT user_id) as users, COUNT(*) as total FROM user_daily_missions WHERE expires_at > now()");
console.log(`Usuarios con misiones activas: ${userMissions.rows[0].users}, Total registros: ${userMissions.rows[0].total}`);

console.log('\n=== 8. Revisar bonus activos ===');
const bonuses = await c.query("SELECT COUNT(*) as active FROM user_active_bonuses WHERE expires_at > now()");
console.log(`Bonos activos actualmente: ${bonuses.rows[0].active}`);

await c.end();
