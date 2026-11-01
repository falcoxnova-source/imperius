import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

console.log('=== Funciones ===');
const fns = await c.query("SELECT proname FROM pg_proc WHERE proname IN ('get_premium_missions','purchase_daily_mission_bonus')");
fns.rows.forEach(r => console.log(`  ${r.proname}`));

console.log('\n=== Grants ===');
const gr = await c.query("SELECT routine_name, grantee FROM information_schema.routine_privileges WHERE routine_name IN ('get_premium_missions','purchase_daily_mission_bonus') AND grantee = 'authenticated'");
gr.rows.forEach(r => console.log(`  ${r.routine_name} -> ${r.grantee}`));

console.log('\n=== Premium missions ===');
const pm = await c.query("SELECT code, cost_fxu, reward_value FROM daily_missions WHERE mission_type = 'premium' ORDER BY cost_fxu");
pm.rows.forEach(r => console.log(`  ${r.code}: ${r.cost_fxu} FXU -> +${r.reward_value}%`));

console.log('\n=== Speed bonus in functions ===');
const sb = await c.query("SELECT proname FROM pg_proc WHERE prosrc LIKE '%get_user_daily_mission_speed_bonus%' AND proname IN ('secure_add_to_building_queue','secure_start_research','secure_add_to_shipyard_queue')");
sb.rows.forEach(r => console.log(`  ${r.proname}: ✅`));

await c.end();
