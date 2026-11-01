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

  // Full process_fleet_arrival - check if destroy calls process_moon_destruction
  console.log('=== process_fleet_arrival - FULL destroy handling ===');
  const { rows: arrivalFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'process_fleet_arrival'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (arrivalFn.length > 0) {
    const src = arrivalFn[0].prosrc;
    const idx = src.indexOf("'destroy'");
    if (idx >= 0) {
      // Get more context
      console.log(src.substring(Math.max(0, idx - 100), Math.min(src.length, idx + 2500)));
    }
  }

  // Check if destroy is handled in validate_fleet_mission
  console.log('\n\n=== validate_fleet_mission - what missions validated? ===');
  const { rows: valFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'validate_fleet_mission'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (valFn.length > 0) {
    const src = valFn[0].prosrc;
    // Check attack/espionage/destroy section
    const hostileIdx = src.indexOf("IN ('attack', 'espionage', 'destroy')");
    if (hostileIdx >= 0) {
      console.log('=== Hostile missions validation ===');
      console.log(src.substring(hostileIdx - 100, hostileIdx + 800));
    }
    
    // Check for moon target requirement for destroy
    const moonReq = src.indexOf("destroy");
    if (moonReq >= 0) {
      // Find all destroy references
      const destroyRefs = [];
      let idx = 0;
      while (true) {
        idx = src.indexOf('destroy', idx);
        if (idx === -1) break;
        destroyRefs.push(idx);
        idx++;
      }
      console.log('\nDestroy references positions:', destroyRefs);
    }
  }

  // Check translations
  console.log('\n=== Checking translations for destroy ===');
  const tCheck = await c.query(`
    SELECT 1 WHERE EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'get_translations'
    )
  `);
  console.log('Has translations function:', tCheck.rows.length > 0);

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
