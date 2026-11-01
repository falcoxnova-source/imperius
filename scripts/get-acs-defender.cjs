const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});

async function main() {
  await c.connect();

  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_acs_fleet_arrival'");
  const src = r.rows[0].prosrc;
  
  // Get the defender_remaining section and everything after it
  const drIdx = src.indexOf('Update defender remaining');
  if (drIdx === -1) {
    // Try alternative
    const idx2 = src.indexOf('defender_rem');
    // Find the FOR loop that iterates defender_remaining
    let startSearch = src.indexOf('defender_remaining', src.indexOf('defender_remaining') + 1);
    // Actually just get the section after loot handling
    const loopIdx = src.indexOf('FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->\'defender_rem');
    if (loopIdx > -1) {
      console.log('=== ACS defender_remaining loop ===');
      console.log(src.substring(loopIdx, loopIdx + 800));
    } else {
      // Just show from "Update defender" or similar
      const updateDefIdx = src.indexOf('defender_rem', src.indexOf('defender_rem', src.indexOf('defender_rem') + 1) + 1);
      console.log('=== ACS around 3rd defender_remaining ===');
      console.log(src.substring(Math.max(0, updateDefIdx - 100), updateDefIdx + 800));
    }
  }

  // Get the perform_acs_combat defender section to see if it tags source
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_acs_combat'");
  const acs = r2.rows[0].prosrc;
  
  // Check if planet_ships in perform_acs_combat have source tag
  const hasSource = acs.includes("'source'");
  console.log('\n\nperform_acs_combat has source tag:', hasSource);
  
  // Show the defender ship section
  const defShipIdx = acs.indexOf('planet_ships');
  console.log('\n=== perform_acs_combat defender ships section ===');
  console.log(acs.substring(defShipIdx - 50, defShipIdx + 600));

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
