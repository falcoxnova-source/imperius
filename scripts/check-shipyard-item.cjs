const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  const r = await client.query(
    `SELECT pg_get_functiondef(oid) as def 
     FROM pg_proc 
     WHERE proname = 'instant_complete_shipyard_item' 
     AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`
  );
  if (r.rows.length > 0) {
    console.log('========================================');
    console.log('FUNCTION: instant_complete_shipyard_item');
    console.log('========================================');
    console.log(r.rows[0].def);
  } else {
    console.log('[NOT FOUND]');
  }

  // Also check what calls calculate_fxu_cost_research
  const res2 = await client.query(
    `SELECT proname FROM pg_proc 
     WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
     AND pg_get_functiondef(oid) LIKE '%calculate_fxu_cost_research%'`
  );
  console.log('\n=== Functions that call calculate_fxu_cost_research ===');
  res2.rows.forEach(r => console.log('  ' + r.proname));

  const res3 = await client.query(
    `SELECT proname FROM pg_proc 
     WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
     AND pg_get_functiondef(oid) LIKE '%calculate_fxu_cost_shipyard%'`
  );
  console.log('\n=== Functions that call calculate_fxu_cost_shipyard ===');
  res3.rows.forEach(r => console.log('  ' + r.proname));

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
