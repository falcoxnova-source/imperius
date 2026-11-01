const { Client } = require('pg');
const fs = require('fs');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function applyMigration() {
  await c.connect();
  
  const sql = fs.readFileSync('supabase/migrations/20260401_fix_format_unit_report_acs_fleet_matching.sql', 'utf8');
  
  try {
    await c.query(sql);
    console.log('✅ Migration applied successfully: format_unit_report fixed for ACS battles');
  } catch (err) {
    console.error('❌ Error applying migration:', err.message);
  }
  
  // Verify the function exists
  const verify = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'format_unit_report'
  `);
  if (verify.rows.length > 0) {
    const hasFleetId = verify.rows[0].prosrc.includes('fleet_id');
    console.log(`Function contains fleet_id matching: ${hasFleetId ? '✅ YES' : '❌ NO'}`);
  }
  
  await c.end();
}

applyMigration().catch(e => { console.error(e); process.exit(1); });
