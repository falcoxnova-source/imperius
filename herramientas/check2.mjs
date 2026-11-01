import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// rewards table columns
const cols2 = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='destruction_ranking_rewards' ORDER BY ordinal_position");
console.log('rewards cols:', cols2.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const data2 = await c.query('SELECT * FROM destruction_ranking_rewards ORDER BY created_at DESC LIMIT 10');
console.log('rewards:', JSON.stringify(data2.rows, null, 2));

// check admin_revenue for deposit tracking
const revCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='admin_revenue' ORDER BY ordinal_position");
console.log('revenue cols:', revCols.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const rev = await c.query('SELECT * FROM admin_revenue ORDER BY created_at DESC LIMIT 10');
console.log('revenue:', JSON.stringify(rev.rows, null, 2));

// check admin_expenses
const expCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='admin_expenses' ORDER BY ordinal_position");
console.log('expenses cols:', expCols.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const exp = await c.query('SELECT * FROM admin_expenses ORDER BY created_at DESC LIMIT 10');
console.log('expenses:', JSON.stringify(exp.rows, null, 2));

// check for any fxu_ tables
 const fxuTables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%fxu%' OR table_name LIKE '%token%' OR table_name LIKE '%pool%'");
console.log('fxu tables:', fxuTables.rows.map(r=>r.table_name));

// Check for wallet / deposit tracking
await c.end();
