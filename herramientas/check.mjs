import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='destruction_ranking_distributions' ORDER BY ordinal_position");
console.log('distributions cols:', cols.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const data = await c.query('SELECT * FROM destruction_ranking_distributions ORDER BY distribution_month DESC LIMIT 10');
console.log('distributions:', JSON.stringify(data.rows, null, 2));
const cols2 = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='destruction_ranking_rewards' ORDER BY ordinal_position");
console.log('rewards cols:', cols2.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const data2 = await c.query('SELECT * FROM destruction_ranking_rewards ORDER BY distribution_month DESC LIMIT 10');
console.log('rewards:', JSON.stringify(data2.rows, null, 2));
const cfg = await c.query("SELECT * FROM admin_config WHERE key ILIKE '%destruction%' OR key ILIKE '%ranking%' OR key ILIKE '%reward%' OR key ILIKE '%pool%' OR key ILIKE '%destruc%' LIMIT 20");
console.log('config:', JSON.stringify(cfg.rows, null, 2));
const gs = await c.query("SELECT * FROM game_settings WHERE key ILIKE '%destruction%' OR key ILIKE '%destruc%' OR key ILIKE '%ranking%' OR key ILIKE '%pool%' LIMIT 20");
console.log('game_settings:', JSON.stringify(gs.rows, null, 2));
await c.end();
