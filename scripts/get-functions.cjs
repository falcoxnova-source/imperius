const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});

async function main() {
  await c.connect();

  // Get full process_fleet_arrival expedition branch context
  const r1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  const pfa = r1.rows[0].prosrc;
  
  // Find the expedition branch and surrounding context
  const expIdx = pfa.indexOf("'expedition'");
  const destroyIdx = pfa.indexOf("'destroy'");
  console.log('=== process_fleet_arrival EXPEDITION BRANCH (full) ===');
  console.log(pfa.substring(expIdx - 100, destroyIdx));
  
  // Get full perform_acs_combat
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_acs_combat'");
  if (r2.rows.length) {
    console.log('\n\n=== perform_acs_combat FULL SOURCE ===');
    console.log(r2.rows[0].prosrc);
  } else {
    console.log('\nperform_acs_combat NOT FOUND - checking alternatives...');
    const r3 = await c.query("SELECT proname FROM pg_proc WHERE proname LIKE '%combat%' OR proname LIKE '%acs%' ORDER BY proname");
    console.log('Combat-related functions:', r3.rows.map(r => r.proname));
  }

  // Also check: what function does process_fleet_arrival call for attacks?
  const attackIdx = pfa.indexOf("'attack'");
  if (attackIdx > -1) {
    const attackSection = pfa.substring(attackIdx - 50, attackIdx + 500);
    console.log('\n\n=== process_fleet_arrival ATTACK BRANCH ===');
    console.log(attackSection);
  }

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
