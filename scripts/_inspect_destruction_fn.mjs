import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await c.connect();

const def = await c.query(`
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_destruction_ranking'
`);
console.log('=== get_destruction_ranking ===');
console.log(def.rows[0]?.def?.substring(0, 6000) || 'NOT FOUND');

console.log('\n=== Tables possibly involved ===');
const t = await c.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND (
    table_name ILIKE '%destruction%' OR
    table_name ILIKE '%battle%' OR
    table_name ILIKE '%ranking%'
  )
  ORDER BY table_name
`);
console.table(t.rows);

console.log('\n=== Triggers on those tables ===');
const tr = await c.query(`
  SELECT event_object_table, trigger_name, action_statement
  FROM information_schema.triggers
  WHERE trigger_schema='public' AND (
    event_object_table ILIKE '%destruction%' OR
    event_object_table ILIKE '%battle%' OR
    event_object_table ILIKE '%ranking%'
  )
`);
console.table(tr.rows);

await c.end();
