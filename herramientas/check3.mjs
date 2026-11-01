import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Check all admin_config
const cfg = await c.query('SELECT * FROM admin_config ORDER BY key');
console.log('admin_config:', JSON.stringify(cfg.rows, null, 2));

// Check monthly_ranking_distributions and rewards
const mrd = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='monthly_ranking_distributions' ORDER BY ordinal_position");
console.log('monthly_ranking_distributions cols:', mrd.rows.map(r=>r.column_name+' '+r.data_type).join(', '));
const mrdData = await c.query('SELECT * FROM monthly_ranking_distributions ORDER BY distribution_month DESC LIMIT 5');
console.log('monthly_ranking_distributions:', JSON.stringify(mrdData.rows, null, 2));

// Check social_ranking
const srd = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='social_ranking_distributions' ORDER BY ordinal_position");
console.log('social_ranking_distributions cols:', srd.rows.map(r=>r.column_name+' '+r.data_type).join(', '));

// Check admin_speed_settings
const ss = await c.query('SELECT * FROM admin_speed_settings');
console.log('admin_speed_settings:', JSON.stringify(ss.rows, null, 2));

await c.end();
