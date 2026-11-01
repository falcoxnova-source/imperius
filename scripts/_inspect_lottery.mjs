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

// Definicion de create_lottery_draw
const def = await c.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_lottery_draw'`);
console.log(def.rows[0].def);

console.log('\n--- lottery_draws columns ---');
const cols = await c.query(`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='lottery_draws' ORDER BY ordinal_position`);
cols.rows.forEach(r => console.log(`${r.column_name} ${r.data_type} default=${r.column_default}`));

console.log('\n--- admin id ---');
const admin = await c.query("SELECT id, username FROM profiles WHERE is_admin = true ORDER BY created_at LIMIT 3");
admin.rows.forEach(r => console.log(r));

await c.end();
