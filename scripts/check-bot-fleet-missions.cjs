const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT mission_type, COUNT(*)::int AS total
    FROM fleets f
    JOIN profiles p ON p.id = f.user_id
    WHERE p.is_bot = true AND f.created_at >= NOW() - INTERVAL '30 minutes'
    GROUP BY mission_type
    ORDER BY mission_type
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
