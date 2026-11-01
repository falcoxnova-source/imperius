const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Apply migration
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260401_fix_fleet_acceleration_cost_return_trip.sql'),
    'utf8'
  );

  console.log('Applying fleet acceleration cost fix...');
  await c.query(sql);
  console.log('✅ Migration applied!');

  // Verify the updated function
  const r = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'calculate_fxu_cost_fleet'`);
  const src = r.rows[0]?.prosrc || '';

  if (src.includes('arrival_time - v_fleet.departure_time')) {
    console.log('✅ Verified: Outbound fleets now charged for FULL one-way flight duration');
  } else {
    console.log('❌ ERROR: Function not updated correctly');
  }

  // Test with a sample outbound fleet if one exists
  const r2 = await c.query(`
    SELECT f.id, f.mission_type, f.is_returning, f.is_completed,
           f.departure_time::text, f.arrival_time::text, f.return_time::text,
           EXTRACT(EPOCH FROM (f.arrival_time - now())) / 60.0 as mins_to_arrival,
           EXTRACT(EPOCH FROM (f.arrival_time - f.departure_time)) / 60.0 as full_one_way_mins,
           EXTRACT(EPOCH FROM (f.return_time - now())) / 60.0 as mins_to_return,
           p.username
    FROM fleets f
    JOIN profiles p ON p.id = f.user_id
    WHERE f.is_completed = false
    ORDER BY f.departure_time DESC
    LIMIT 5
  `);

  if (r2.rows.length > 0) {
    console.log('\n=== SAMPLE ACTIVE FLEETS ===');
    for (const f of r2.rows) {
      const status = f.is_returning ? 'RETURNING' : 'OUTBOUND';
      console.log(`  ${f.username} | ${f.mission_type} | ${status}`);
      console.log(`    Full one-way: ${parseFloat(f.full_one_way_mins).toFixed(1)} min`);
      if (f.is_returning) {
        console.log(`    Remaining return: ${parseFloat(f.mins_to_return).toFixed(1)} min`);
        console.log(`    Cost based on: ${parseFloat(f.mins_to_return).toFixed(1)} min (remaining return)`);
      } else {
        console.log(`    Remaining outbound: ${parseFloat(f.mins_to_arrival).toFixed(1)} min`);
        console.log(`    OLD cost based on: ${parseFloat(f.mins_to_arrival).toFixed(1)} min (remaining outbound)`);
        console.log(`    NEW cost based on: ${parseFloat(f.full_one_way_mins).toFixed(1)} min (full return trip)`);
      }
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
