const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Get validate_fleet_mission - attack/espionage/destroy section only
  const { rows: fn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'validate_fleet_mission'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  
  if (fn.length > 0) {
    const src = fn[0].prosrc;
    const idx = src.indexOf("IF p_mission_type IN ('attack', 'espionage', 'destroy')");
    if (idx >= 0) {
      console.log('=== ATTACK/ESPIONAGE/DESTROY section ===');
      console.log(src.substring(idx, Math.min(src.length, idx + 2500)));
    }
  }

  // Get secure_send_fleet - the part after probe_type_id 
  const { rows: sendFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (sendFn.length > 0) {
    const src = sendFn[0].prosrc;
    const idx = src.indexOf("espionage_probe");
    if (idx >= 0) {
      console.log('\n\n=== secure_send_fleet from espionage_probe onwards ===');
      console.log(src.substring(idx, Math.min(src.length, idx + 3000)));
    }
  }

  // Check frontend for probe attack restriction
  console.log('\n\n=== DONE ===');
  
  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
