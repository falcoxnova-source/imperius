const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});

async function main() {
  await c.connect();

  // Get the allied fleet section from perform_combat
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_combat'");
  const src = r.rows[0].prosrc;
  
  // Find from ALLIED to simulate_xnova_combat
  const alliedIdx = src.indexOf('ALLIED');
  const simIdx = src.indexOf('simulate_xnova_combat');
  console.log('=== perform_combat: ALLIED section through simulate ===');
  console.log(src.substring(alliedIdx, simIdx + 200));
  
  // Also get variable declarations for allied fleet
  const declIdx = src.indexOf('DECLARE');
  const beginIdx = src.indexOf('BEGIN');
  console.log('\n\n=== perform_combat DECLARE section ===');
  console.log(src.substring(declIdx, beginIdx + 10));

  // Check perform_acs_combat - what does the post-combat section look like in process_fleet_arrival for ACS?
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  const pfa = r2.rows[0].prosrc;
  const acsIdx = pfa.indexOf('acs');
  if (acsIdx > -1) {
    console.log('\n\n=== process_fleet_arrival ACS mentions ===');
    // Find all acs mentions
    let idx = 0;
    while (true) {
      idx = pfa.indexOf('acs', idx);
      if (idx === -1) break;
      const lineStart = Math.max(0, idx - 80);
      const lineEnd = Math.min(pfa.length, idx + 80);
      console.log('  ...', pfa.substring(lineStart, lineEnd).replace(/\n/g, ' '), '...');
      idx += 3;
    }
  }
  
  // Check what source tags are used in perform_combat for allied fleets (for post-combat loss routing)
  const sourceIdx = src.indexOf("'source'");
  if (sourceIdx > -1) {
    console.log('\n\n=== perform_combat source tag section ===');
    let idx = 0;
    while (true) {
      idx = src.indexOf("source", idx);
      if (idx === -1) break;
      const lineStart = Math.max(0, idx - 40);
      const lineEnd = Math.min(src.length, idx + 80);
      console.log('  ...', src.substring(lineStart, lineEnd).replace(/\n/g, ' '), '...');
      idx += 6;
    }
  }

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
