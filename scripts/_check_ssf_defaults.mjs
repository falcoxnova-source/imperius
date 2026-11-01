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
    pg_get_function_identity_arguments(p.oid) AS args,
    pg_get_function_arguments(p.oid) AS args_with_defaults,
    p.pronargdefaults AS num_defaults
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'secure_send_fleet'
  ORDER BY p.oid
`);
r.rows.forEach((row, i) => {
  console.log(`\n[${i+1}] OID ${row.oid} (defaults: ${row.num_defaults})`);
  console.log('  args:', row.args_with_defaults);
});

await client.end();
