import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Check tables
const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('daily_missions','user_daily_missions','user_active_bonuses')");
console.log('Tables:', tables.rows.map(r => r.table_name));

// Check mission count
const mc = await c.query("SELECT COUNT(*) FROM daily_missions");
console.log('Misiones semilla:', mc.rows[0].count);

// Check functions
const fn = await c.query("SELECT proname FROM pg_proc WHERE proname IN ('get_user_daily_missions','claim_daily_mission_reward','get_user_daily_mission_production_bonus','update_daily_mission_progress')");
console.log('Funciones:', fn.rows.map(r => r.proname));

// Check production bonus in calculate_planet_resources
const pr = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'calculate_planet_resources'");
const hasBonus = pr.rows[0].prosrc.includes('get_user_daily_mission_production_bonus');
console.log('Bonus de produccion en calculate:', hasBonus ? 'SI' : 'NO');

// Check triggers on fleets
const tr = await c.query("SELECT event_object_table, trigger_name FROM information_schema.triggers WHERE trigger_name LIKE '%daily_mission%'");
console.log('Triggers:', tr.rows.map(r => r.trigger_name + ' ON ' + r.event_object_table));

await c.end();
