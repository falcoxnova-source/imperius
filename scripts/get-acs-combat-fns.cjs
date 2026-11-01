const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // Get process_acs_fleet_arrival
  const r1 = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_acs_fleet_arrival'");
  console.log('========== process_acs_fleet_arrival ==========');
  console.log(r1.rows[0]?.prosrc || 'NOT FOUND');
  
  console.log('\n\n========== perform_acs_combat ==========');
  const r2 = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_acs_combat'");
  console.log(r2.rows[0]?.prosrc || 'NOT FOUND');
  
  console.log('\n\n========== format_unit_report ==========');
  const r3 = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'format_unit_report'");
  console.log(r3.rows[0]?.prosrc || 'NOT FOUND');
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
