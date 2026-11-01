const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Check how many versions of secure_send_fleet exist
  const { rows } = await c.query(`
    SELECT p.oid, p.proname, pg_get_function_arguments(p.oid) as args
    FROM pg_proc p
    WHERE p.proname = 'secure_send_fleet'
    AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY p.oid
  `);

  console.log('=== secure_send_fleet versions:', rows.length, '===');
  for (const r of rows) {
    console.log(`  OID ${r.oid}: (${r.args})`);
  }

  // Also check get_incoming_attacks
  const { rows: attacks } = await c.query(`
    SELECT p.oid, p.proname, pg_get_function_arguments(p.oid) as args
    FROM pg_proc p
    WHERE p.proname = 'get_incoming_attacks'
    AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY p.oid
  `);
  console.log('\n=== get_incoming_attacks versions:', attacks.length, '===');
  for (const r of attacks) {
    console.log(`  OID ${r.oid}: (${r.args})`);
  }

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
