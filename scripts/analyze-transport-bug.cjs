const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});

c.connect().then(async()=>{
  // Get the CURRENT process_fleet_arrival function
  const {rows} = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  const src = rows[0].prosrc;
  const lines = src.split('\n');
  
  // Find the transport/deployment section
  console.log('=== TRANSPORT MISSION SECTION ===');
  let inTransport = false;
  let braceDepth = 0;
  lines.forEach((l, i) => {
    const ln = i + 1;
    // Look for transport-related code
    if (l.match(/transport|deploy|despliegue|mission_type.*3|WHEN 3|mission.*3/i)) {
      inTransport = true;
    }
    if (inTransport) {
      console.log(ln + ': ' + l);
      if (l.match(/WHEN [0-9]|END CASE|ELSIF|ELSE/i) && !l.match(/transport|WHEN 3/i) && ln > 10) {
        inTransport = false;
        console.log('--- END TRANSPORT SECTION ---\n');
      }
    }
  });

  // Also search for "return" fleet creation
  console.log('\n\n=== RETURN FLEET / SHIPS BACK HOME SECTIONS ===');
  lines.forEach((l, i) => {
    const ln = i + 1;
    if (l.match(/return.*fleet|fleet.*return|back.*home|origin|source.*planet|return_time|returning|v_fleet.*status.*'returning'/i)) {
      // Print surrounding context
      for (let j = Math.max(0, i-3); j <= Math.min(lines.length-1, i+3); j++) {
        console.log((j+1) + ': ' + lines[j]);
      }
      console.log('---');
    }
  });

  // Search for deploy/station mission
  console.log('\n\n=== DEPLOY/STATION SECTION ===');
  lines.forEach((l, i) => {
    const ln = i + 1;
    if (l.match(/deploy|station|WHEN 4|mission_type.*4/i)) {
      for (let j = Math.max(0, i-2); j <= Math.min(lines.length-1, i+15); j++) {
        console.log((j+1) + ': ' + lines[j]);
      }
      console.log('---');
    }
  });

  await c.end();
}).catch(e=>console.error(e));
