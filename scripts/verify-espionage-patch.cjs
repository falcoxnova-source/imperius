const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

c.connect().then(async () => {
  // Check process_fleet_arrival was patched
  const r = await c.query(
    `SELECT prosrc FROM pg_proc WHERE proname='process_fleet_arrival' ORDER BY oid DESC LIMIT 1`
  );
  const src = r.rows[0].prosrc;
  
  console.log('=== process_fleet_arrival ===');
  console.log('Has v_esp_probe_count:', src.includes('v_esp_probe_count'));
  console.log('Has probes_destroyed:', src.includes('probes_destroyed'));
  console.log('Has 4-arg generate_espionage_report:', src.includes('v_esp_probe_count'));
  
  // Check generate_espionage_report return type
  const r2 = await c.query(
    `SELECT prorettype::regtype::text as ret FROM pg_proc WHERE proname='generate_espionage_report' ORDER BY oid DESC LIMIT 1`
  );
  console.log('\n=== generate_espionage_report ===');
  console.log('Return type:', r2.rows[0].ret);
  
  // Check the espionage branch in process_fleet_arrival
  const espBlock = src.substring(
    src.indexOf("'espionage'"),
    src.indexOf("'espionage'") + 800
  );
  console.log('\n=== Espionage branch (first 800 chars) ===');
  console.log(espBlock);
  
  await c.end();
}).catch(e => { console.error('ERROR:', e.message); c.end(); });
