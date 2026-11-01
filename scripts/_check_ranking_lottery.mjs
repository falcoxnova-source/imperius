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

// 1) get_destruction_ranking
const r1 = await client.query(`
  SELECT p.oid, pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS returns
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_destruction_ranking'
  ORDER BY p.oid
`);
console.log('--- get_destruction_ranking ---');
console.log('Versiones:', r1.rows.length);
r1.rows.forEach((row, i) => console.log(`[${i+1}] OID ${row.oid}: (${row.args}) returns ${row.returns}`));

// Probarla
try {
  const t1 = await client.query('SELECT get_destruction_ranking(100, 0)');
  console.log('Test ok:', t1.rows.length, 'rows');
} catch (e) {
  console.log('Test ERROR:', e.message);
}

// 2) Lottery functions
const r2 = await client.query(`
  SELECT p.proname, pg_get_function_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname ILIKE '%lottery%'
  ORDER BY p.proname
`);
console.log('\n--- lottery functions ---');
r2.rows.forEach(row => console.log(`${row.proname}(${row.args})`));

await client.end();
