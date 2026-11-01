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

  const fns = ['instant_complete_research', 'instant_complete_shipyard', 'instant_complete_building'];
  
  for (const fn of fns) {
    const r = await client.query(
      `SELECT pg_get_functiondef(oid) as def 
       FROM pg_proc 
       WHERE proname = $1 
       AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
      [fn]
    );
    if (r.rows.length > 0) {
      console.log('========================================');
      console.log('FUNCTION: ' + fn);
      console.log('========================================');
      console.log(r.rows[0].def);
      console.log('');
    } else {
      console.log('[NOT FOUND] ' + fn);
    }
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
