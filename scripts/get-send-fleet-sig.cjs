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
  const r = await c.query(`SELECT pg_get_function_arguments(oid) as args, prorettype::regtype as rettype FROM pg_proc WHERE proname='send_fleet'`);
  console.log('Args:', r.rows[0].args);
  console.log('Return:', r.rows[0].rettype);
  await c.end();
}

main().catch(e => { console.error(e.message); });
