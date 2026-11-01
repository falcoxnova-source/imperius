const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  for (const t of ['plus_subscriptions', 'plus_plans']) {
    const r = await c.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [t]
    );
    console.log('===', t);
    console.log(r.rows);
  }
  const plans = await c.query('SELECT * FROM plus_plans ORDER BY 1');
  console.log('--- plus_plans rows ---');
  console.log(plans.rows);
  await c.end();
})();
