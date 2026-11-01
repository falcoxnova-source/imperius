import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Check monthly_ranking_rewards
const mrr = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='monthly_ranking_rewards' ORDER BY ordinal_position");
console.log('monthly_ranking_rewards cols:', mrr.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const mrrData = await c.query('SELECT * FROM monthly_ranking_rewards ORDER BY created_at DESC LIMIT 5');
console.log('monthly_ranking_rewards:', JSON.stringify(mrrData.rows, null, 2));

// Check social_ranking_rewards
const srr = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='social_ranking_rewards' ORDER BY ordinal_position");
console.log('social_ranking_rewards cols:', srr.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const srrData = await c.query('SELECT * FROM social_ranking_rewards ORDER BY created_at DESC LIMIT 5');
console.log('social_ranking_rewards:', JSON.stringify(srrData.rows, null, 2));

// Check admin_revenue total by type
const revByType = await c.query("SELECT revenue_type, SUM(amount) as total FROM admin_revenue GROUP BY revenue_type ORDER BY total DESC");
console.log('revenue by type:', JSON.stringify(revByType.rows, null, 2));

// Check attack_log for destruction tracking
const alCols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='attack_log' ORDER BY ordinal_position");
console.log('attack_log cols:', alCols.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const al = await c.query('SELECT * FROM attack_log ORDER BY created_at DESC LIMIT 5');
console.log('attack_log:', JSON.stringify(al.rows, null, 2));

// Check for total destruction points per user
const totalDest = await c.query("SELECT SUM(destruction_points) as total FROM destruction_ranking_rewards WHERE distribution_id = (SELECT id FROM destruction_ranking_distributions ORDER BY distribution_month DESC LIMIT 1)");
console.log('total destruction points last month:', JSON.stringify(totalDest.rows, null, 2));

await c.end();
