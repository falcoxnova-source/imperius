const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. Does calculate_planet_resources UPDATE the table or just RETURN values?
  const r1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='calculate_planet_resources' AND pronamespace='public'::regnamespace");
  const src1 = r1.rows[0]?.prosrc || '';
  console.log('=== calculate_planet_resources: Has UPDATE?:', src1.includes('UPDATE planet_resources'));
  
  // Find all UPDATE statements in calculate_planet_resources
  const lines1 = src1.split('\n');
  for (let i = 0; i < lines1.length; i++) {
    if (lines1[i].toLowerCase().includes('update')) {
      console.log(`  L${i+1}: ${lines1[i].trim()}`);
    }
  }

  // 2. Find ALL functions that do UPDATE planet_resources with production-like patterns
  const r2 = await c.query(`
    SELECT proname, 
           prosrc LIKE '%UPDATE planet_resources%' as updates_resources,
           prosrc LIKE '%metal + %' OR prosrc LIKE '%metal =%' as adds_metal
    FROM pg_proc 
    WHERE pronamespace = 'public'::regnamespace
    AND prosrc LIKE '%UPDATE planet_resources%'
    ORDER BY proname
  `);
  console.log('\n=== Functions that UPDATE planet_resources ===');
  r2.rows.forEach(r => console.log(`  ${r.proname}`));

  // 3. Check if there's a resource_update cron or function
  const r3 = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE pronamespace = 'public'::regnamespace
    AND (proname LIKE '%resource%' OR proname LIKE '%production%')
    ORDER BY proname
  `);
  console.log('\n=== Resource-related functions ===');
  r3.rows.forEach(r => console.log(`  ${r.proname}`));

  // 4. Check if there's a separate resource update cron in pg_cron
  try {
    const r4 = await c.query("SELECT jobid, schedule, command FROM cron.job ORDER BY jobid");
    console.log('\n=== Cron jobs ===');
    r4.rows.forEach(r => console.log(`  [${r.jobid}] ${r.schedule}: ${r.command.substring(0, 100)}`));
  } catch(e) {
    console.log('\n=== Cron jobs: ERROR:', e.message);
  }

  // 5. Check specific functions that might update resources
  for (const fname of ['update_resources', 'accumulate_resources', 'process_resources', 'resource_cron', 'update_planet_resources_cron']) {
    const r = await c.query("SELECT 1 FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace", [fname]);
    if (r.rows.length > 0) console.log(`  Function exists: ${fname}`);
  }

  // 6. Look at the 4 metal lines in the CRON to understand what they do
  const r6 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='optimized_global_queue_processor' AND pronamespace='public'::regnamespace");
  const src6 = r6.rows[0]?.prosrc || '';
  const lines6 = src6.split('\n');
  console.log('\n=== CRON: Lines with metal/crystal/deuterium ===');
  for (let i = 0; i < lines6.length; i++) {
    if (lines6[i].toLowerCase().includes('metal') || lines6[i].toLowerCase().includes('crystal') || lines6[i].toLowerCase().includes('deuterium')) {
      // Show context (2 lines before and after)
      for (let j = Math.max(0, i-2); j <= Math.min(lines6.length-1, i+2); j++) {
        console.log(`  ${j+1}: ${lines6[j]}`);
      }
      console.log('  ---');
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
