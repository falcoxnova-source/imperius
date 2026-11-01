const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
c.connect().then(async()=>{
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick'");
  const src = r.rows[0].prosrc;
  const lines = src.split('\n');
  
  // Find building queue logic
  console.log('=== BUILDING QUEUE LOGIC ===');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/queue|cola|commander|oficial|officer|dark_matter|v_queue|max_queue|building_queue/i)) {
      // Print context
      for (let j = Math.max(0, i-2); j <= Math.min(lines.length-1, i+2); j++) {
        console.log(`${j}: ${lines[j]}`);
      }
      console.log('---');
    }
  }
  
  // Also check shipyard queue logic
  console.log('\n=== SHIPYARD QUEUE LOGIC ===');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/shipyard_queue|ship.*queue/i)) {
      for (let j = Math.max(0, i-2); j <= Math.min(lines.length-1, i+2); j++) {
        console.log(`${j}: ${lines[j]}`);
      }
      console.log('---');
    }
  }

  await c.end();
});
