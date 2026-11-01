const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  const r = await c.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'process_acs_fleet_arrival'
  `);
  let full = r.rows[0].def;

  // Find the defender remaining loop
  const forStart = full.indexOf("jsonb_array_elements(v_combat_result->'defender_remaining')");
  console.log('FOR starts at:', forStart);
  
  // Show the section
  const section = full.substring(forStart - 80, forStart + 800);
  console.log('\n=== Defender remaining section ===');
  console.log(section);
  
  // Show the exact lines with line numbers
  const lines = section.split(/\r?\n/);
  lines.forEach((line, i) => console.log(`  ${i}: ${JSON.stringify(line)}`));

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
