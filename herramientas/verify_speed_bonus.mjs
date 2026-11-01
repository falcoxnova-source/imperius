import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const funcs = [
  'get_user_daily_mission_speed_bonus',
  'secure_add_to_building_queue',
  'secure_start_research',
  'secure_add_to_shipyard_queue'
];

for (const f of funcs) {
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = $1", [f]);
  if (r.rows.length === 0) {
    console.log(`${f}: NO ENCONTRADA`);
    continue;
  }
  const body = r.rows[0].prosrc;
  const hasBonus = body.includes('get_user_daily_mission_speed_bonus');
  const hasDiv = body.includes('/ 100');
  const hasDeclare = f !== 'get_user_daily_mission_speed_bonus' ? body.includes('v_speed_bonus numeric') : true;

  const ok = hasBonus && hasDeclare;
  console.log(`${f}: ${ok ? '✅' : '❌'} speed_bonus=${hasBonus} declare=${hasDeclare} /100=${hasDiv}`);
}

// Check grants
const gr = await c.query("SELECT grantee, routine_name FROM information_schema.routine_privileges WHERE routine_name = 'get_user_daily_mission_speed_bonus' AND grantee = 'authenticated'");
console.log(`Grant authenticated: ${gr.rows.length > 0 ? '✅ SI' : '❌ NO'}`);

await c.end();
