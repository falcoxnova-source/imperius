import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'secure_add_to_shipyard_queue'");
const body = r.rows[0].prosrc;

// Check for speed bonus
console.log('Has speed bonus:', body.includes('get_user_daily_mission_speed_bonus'));
console.log('Has v_speed_bonus declare:', body.includes('v_speed_bonus numeric'));

// Show lines around VIP
const lines = body.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('is_user_plus') || lines[i].includes('0.90') || lines[i].includes('speed')) {
    console.log(`Line ${i}: ${lines[i].trim()}`);
  }
}

await c.end();
