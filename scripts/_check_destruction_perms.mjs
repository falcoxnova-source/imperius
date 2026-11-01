import { Client } from 'pg';
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
await c.connect();

// Permisos de get_destruction_ranking
const r = await c.query(`
  SELECT
    p.proname,
    pg_get_function_arguments(p.oid) AS args,
    p.prosecdef AS security_definer,
    array_to_string(p.proacl, ', ') AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_destruction_ranking'
`);
r.rows.forEach(row => {
  console.log('proname:', row.proname);
  console.log('  args:', row.args);
  console.log('  security_definer:', row.security_definer);
  console.log('  acl:', row.acl);
});

// Llamada como rol anon/authenticated
console.log('\nProbando con rol authenticated...');
await c.query('SET ROLE authenticated');
try {
  const r2 = await c.query('SELECT * FROM get_destruction_ranking() LIMIT 1');
  console.log('  OK como authenticated:', r2.rows.length);
} catch (e) {
  console.log('  ERROR como authenticated:', e.message);
}
await c.query('RESET ROLE');

console.log('\nProbando con rol anon...');
await c.query('SET ROLE anon');
try {
  const r3 = await c.query('SELECT * FROM get_destruction_ranking() LIMIT 1');
  console.log('  OK como anon:', r3.rows.length);
} catch (e) {
  console.log('  ERROR como anon:', e.message);
}
await c.query('RESET ROLE');

await c.end();
