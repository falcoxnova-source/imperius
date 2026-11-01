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

await client.query(`
  DROP FUNCTION IF EXISTS public.secure_send_fleet(
    uuid, integer, integer, integer, text, jsonb,
    bigint, bigint, bigint, integer, text, uuid
  );
`);
console.log('OK. Estado final:');

const r = await client.query(`
  SELECT p.oid, pg_get_function_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'secure_send_fleet'
  ORDER BY p.oid
`);
console.log('Versiones restantes:', r.rows.length);
r.rows.forEach((row, i) => console.log(`[${i+1}] OID ${row.oid}: ${row.args}`));

await client.end();
