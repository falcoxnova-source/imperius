import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// 1. Get claim_daily_mission_reward to verify it inserts into user_active_bonuses correctly
const claimFn = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'claim_daily_mission_reward'");
const claimBody = claimFn.rows[0].prosrc;
console.log('=== 1. claim_daily_mission_reward ===');
console.log('Insert a user_active_bonuses:', claimBody.includes('INSERT INTO user_active_bonuses') ? 'SI' : 'NO');
console.log('Marca claimed=true:', claimBody.includes("SET claimed = true") ? 'SI' : 'NO');
console.log('Verifica completed=true:', claimBody.includes('completed = true') ? 'SI' : 'NO');
console.log('Verifica no expirado:', claimBody.includes('expires_at > now') ? 'SI' : 'NO');

// 2. Get get_user_daily_mission_production_bonus
const bonusFn = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'get_user_daily_mission_production_bonus'");
const bonusBody = bonusFn.rows[0].prosrc;
console.log('\n=== 2. get_user_daily_mission_production_bonus ===');
console.log('Suma bonus activos:', bonusBody.includes('SUM') ? 'SI' : 'NO');
console.log('Filtra por no expirados:', bonusBody.includes('expires_at > now') ? 'SI' : 'NO');
console.log('Divide entre 100:', bonusBody.includes('/ 100') ? 'SI' : 'NO');

// 3. Check calculate_planet_resources uses the bonus
const calcFn = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'calculate_planet_resources'");
const calcBody = calcFn.rows[0].prosrc;
console.log('\n=== 3. calculate_planet_resources ===');
console.log('Llama a get_user_daily_mission_production_bonus:', calcBody.includes('get_user_daily_mission_production_bonus') ? 'SI' : 'NO');
console.log('Se suma a v_mine_bonus antes de aplicarlo a produccion:', calcBody.indexOf('v_mine_bonus := v_mine_bonus +') > 0 ? 'SI' : 'NO');

// 4. Simulate full flow for a test user
const testUserId = 'fc82d77a-0f5d-4f81-a571-0e399871d74d'; // falcoxcorp admin
console.log('\n=== 4. Simulando flujo completo ===');

// 4a. Assign missions
await c.query("SELECT assign_daily_missions($1)", [testUserId]);
const missionsBefore = await c.query("SELECT udm.id, dm.code, udm.progress, udm.completed, udm.claimed FROM user_daily_missions udm JOIN daily_missions dm ON dm.id = udm.mission_id WHERE udm.user_id = $1 AND udm.expires_at > now()", [testUserId]);
console.log('Misiones asignadas:', missionsBefore.rows.length);

// 4b. Simulate completing one mission by pushing progress to target
for (const m of missionsBefore.rows) {
  const missionDetail = await c.query("SELECT target_count, mission_type FROM daily_missions dm JOIN user_daily_missions udm ON udm.mission_id = dm.id WHERE udm.id = $1", [m.id]);
  const target = parseInt(missionDetail.rows[0].target_count);
  const mtype = missionDetail.rows[0].mission_type;
  // Set progress to target to complete it
  await c.query("UPDATE user_daily_missions SET progress = $1, completed = true WHERE id = $2", [target, m.id]);
  console.log(`  ${m.code} (${mtype}): progreso forzado a ${target}/${target} → completed`);
}

// 4c. Claim the first mission
const firstMission = await c.query("SELECT id FROM user_daily_missions WHERE user_id = $1 AND completed = true AND claimed = false LIMIT 1", [testUserId]);
if (firstMission.rows.length > 0) {
  const claimResult = await c.query("SELECT claim_daily_mission_reward($1, $2)", [testUserId, firstMission.rows[0].id]);
  console.log('Claim result:', claimResult.rows[0].claim_daily_mission_reward);

  // 4d. Check bonus was inserted
  const bonuses = await c.query("SELECT bonus_type, bonus_value, expires_at FROM user_active_bonuses WHERE user_id = $1 AND expires_at > now()", [testUserId]);
  console.log('Bonos activos después del claim:', bonuses.rows.length);
  bonuses.rows.forEach(b => console.log(`  ${b.bonus_type}: ${b.bonus_value}% expira: ${b.expires_at}`));

  // 4e. Check get_user_daily_mission_production_bonus returns correct value
  const prodBonus = await c.query("SELECT get_user_daily_mission_production_bonus($1)", [testUserId]);
  console.log('Produccion bonus devuelto:', prodBonus.rows[0].get_user_daily_mission_production_bonus);
}

await c.end();
