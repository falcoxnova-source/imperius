const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});

async function main() {
  await c.connect();

  // Get full process_fleet_arrival to understand the exact expedition branch
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  const pfa = r.rows[0].prosrc;
  
  // Get the defender remaining section in process_fleet_arrival (for regular attack)
  // to see how source-based routing works
  const defRemIdx = pfa.indexOf('defender_remaining');
  if (defRemIdx > -1) {
    // Find all occurrences 
    let idx = 0;
    let count = 0;
    while (true) {
      idx = pfa.indexOf('defender_remaining', idx);
      if (idx === -1) break;
      count++;
      if (count <= 3) {
        console.log(`\n=== defender_remaining occurrence ${count} ===`);
        console.log(pfa.substring(Math.max(0, idx - 50), Math.min(pfa.length, idx + 400)));
      }
      idx += 18;
    }
    console.log('\nTotal defender_remaining occurrences:', count);
  }

  // Also check: how does process_acs_fleet_arrival handle defender remaining?  
  // I already have the full source, but let me focus on the defender_remaining loop
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_acs_fleet_arrival'");
  const acs = r2.rows[0].prosrc;
  const acsDefIdx = acs.indexOf('defender_remaining');
  if (acsDefIdx > -1) {
    console.log('\n\n=== process_acs_fleet_arrival defender_remaining section ===');
    console.log(acs.substring(Math.max(0, acsDefIdx - 100), Math.min(acs.length, acsDefIdx + 500)));
  }
  
  // Check: does process_acs_fleet_arrival handle 'source' based routing?
  const sourceInAcs = acs.indexOf('source');
  console.log('\n\nprocess_acs_fleet_arrival has "source":', sourceInAcs > -1);

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
