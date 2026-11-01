const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});

async function main() {
  await c.connect();

  // Get process_acs_fleet_arrival to see how post-combat losses are handled for ACS
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_acs_fleet_arrival'");
  if (r.rows.length) {
    console.log('=== process_acs_fleet_arrival FULL ===');
    console.log(r.rows[0].prosrc);
  } else {
    console.log('process_acs_fleet_arrival NOT FOUND');
  }

  // Also check what source tags the ACS post-combat uses
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  const pfa = r2.rows[0].prosrc;
  
  // Find how defender losses are handled after ACS combat  
  const acsFleetIdx = pfa.indexOf('process_acs_fleet_arrival');
  if (acsFleetIdx > -1) {
    console.log('\n\n=== Around process_acs_fleet_arrival call ===');
    console.log(pfa.substring(Math.max(0, acsFleetIdx - 300), acsFleetIdx + 500));
  }

  // Check how perform_combat's source tags are used in post-combat to route losses to allied fleets
  // Find "source" in process_fleet_arrival
  let idx = 0;
  const sources = [];
  while (true) {
    idx = pfa.indexOf('source', idx);
    if (idx === -1) break;
    sources.push(pfa.substring(Math.max(0, idx - 60), Math.min(pfa.length, idx + 100)));
    idx += 6;
  }
  if (sources.length) {
    console.log('\n\n=== process_fleet_arrival "source" references ===');
    sources.forEach((s, i) => console.log(`[${i}]`, s.replace(/\n/g, ' ')));
  }

  // Check the latest migration file names for context
  const r3 = await c.query("SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10");
  console.log('\n\n=== Latest 10 migrations ===');
  r3.rows.forEach(r => console.log(r.version));

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
