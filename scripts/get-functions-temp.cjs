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
  
  const sql = `SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('calculate_fxu_cost_fleet', 'secure_abandon_colony') AND pronamespace = 'public'::regnamespace ORDER BY proname;`;
  
  const result = await client.query(sql);
  
  for (const row of result.rows) {
    console.log('============================');
    console.log('FUNCTION: ' + row.proname);
    console.log('============================');
    console.log(row.pg_get_functiondef);
    console.log('\n');
  }
  
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
