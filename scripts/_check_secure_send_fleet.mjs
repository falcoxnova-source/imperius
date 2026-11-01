import { Client } from 'pg';
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
await client.connect();

const r = await client.query(`
  SELECT
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS args,
    pg_get_function_result(p.oid) AS returns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'secure_send_fleet'
  ORDER BY p.oid
`);

console.log('Versiones de secure_send_fleet encontradas:', r.rows.length);
r.rows.forEach((row, i) => {
  console.log(`\n[${i+1}] OID ${row.oid}`);
  console.log('  args:', row.args);
});

await client.end();
