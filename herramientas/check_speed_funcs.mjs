import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const funcs = ['secure_add_to_building_queue', 'secure_start_research', 'secure_add_to_shipyard_queue'];
for (const f of funcs) {
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = $1", [f]);
  if (r.rows.length > 0) {
    console.log(`=== ${f} (${r.rows[0].prosrc.length} chars) ===`);

    // Check if it already has daily mission speed bonus
    if (r.rows[0].prosrc.includes('daily_mission_speed')) {
      console.log('  Ya tiene daily mission speed bonus');
    } else {
      console.log('  NO tiene daily mission speed bonus');
    }

    // Find where VIP bonus is applied to understand insertion point
    if (r.rows[0].prosrc.includes("0.90") || r.rows[0].prosrc.includes("is_user_plus")) {
      console.log('  Tiene VIP bonus');
    }
    if (r.rows[0].prosrc.includes("0.75") || r.rows[0].prosrc.includes("technocrat")) {
      console.log('  Tiene Technocrat bonus');
    }
    console.log('');
  }
}

await c.end();
