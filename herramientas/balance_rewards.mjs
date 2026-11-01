import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const updates = [
  ['destroy_3', 'production_bonus', 10],
  ['destroy_5', 'speed_bonus', 12],
  ['spy_3', 'production_bonus', 6],
  ['spy_5', 'speed_bonus', 8],
  ['expedition_2', 'production_bonus', 12],
  ['expedition_4', 'speed_bonus', 15],
  ['build_3', 'production_bonus', 5],
  ['build_5', 'speed_bonus', 7],
  ['research_2', 'production_bonus', 8],
  ['research_3', 'speed_bonus', 10],
  ['collect_metal_500k', 'speed_bonus', 5],
  ['collect_crystal_250k', 'production_bonus', 7],
];

for (const [code, type, value] of updates) {
  await c.query("UPDATE daily_missions SET reward_type = $1, reward_value = $2 WHERE code = $3", [type, value, code]);
}

const r = await c.query("SELECT code, mission_type, reward_type, reward_value || '%' AS bonus FROM daily_missions ORDER BY id");
r.rows.forEach(row => console.log(`  ${row.code} (${row.mission_type}): ${row.reward_type} ${row.bonus}`));

await c.end();
