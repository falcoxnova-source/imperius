import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Find a real user
const users = await c.query("SELECT id, username FROM profiles WHERE is_admin IS NOT TRUE AND is_hidden IS NOT TRUE LIMIT 5");
console.log('Usuarios disponibles:');
users.rows.forEach(u => console.log(`  ${u.id} - ${u.username}`));

if (users.rows.length > 0) {
  const testUserId = users.rows[0].id;
  console.log(`\nUsando usuario: ${users.rows[0].username} (${testUserId})`);

  // Assign missions
  await c.query("SELECT assign_daily_missions($1)", [testUserId]);
  const missionsBefore = await c.query("SELECT udm.id, dm.code, udm.progress, udm.completed, udm.claimed, dm.target_count FROM user_daily_missions udm JOIN daily_missions dm ON dm.id = udm.mission_id WHERE udm.user_id = $1 AND udm.expires_at > now() ORDER BY dm.id", [testUserId]);
  console.log(`Misiones asignadas: ${missionsBefore.rows.length}`);
  missionsBefore.rows.forEach(m => console.log(`  ${m.code}: ${m.progress}/${m.target_count} completed=${m.completed} claimed=${m.claimed}`));

  // Complete & claim first mission
  const first = missionsBefore.rows[0];
  await c.query("UPDATE user_daily_missions SET progress = $1, completed = true WHERE id = $2", [first.target_count, first.id]);
  console.log(`\nCompletada: ${first.code}`);

  const claimResult = await c.query("SELECT claim_daily_mission_reward($1, $2)", [testUserId, first.id]);
  console.log('Claim result:', JSON.stringify(claimResult.rows[0].claim_daily_mission_reward));

  // Check bonus was inserted
  const bonuses = await c.query("SELECT bonus_type, bonus_value, expires_at FROM user_active_bonuses WHERE user_id = $1 AND expires_at > now()", [testUserId]);
  console.log(`Bonos activos: ${bonuses.rows.length}`);
  bonuses.rows.forEach(b => console.log(`  ${b.bonus_type}: ${b.bonus_value}% expira: ${b.expires_at}`));

  // Check production bonus function
  const prodBonus = await c.query("SELECT get_user_daily_mission_production_bonus($1)", [testUserId]);
  console.log(`get_user_daily_mission_production_bonus devuelve: ${prodBonus.rows[0].get_user_daily_mission_production_bonus}`);
}

await c.end();
