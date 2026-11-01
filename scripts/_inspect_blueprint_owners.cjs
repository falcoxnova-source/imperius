process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('--- Total usuarios con al menos 1 plano ---');
  console.table((await c.query('SELECT COUNT(DISTINCT user_id) AS usuarios FROM user_ship_blueprints')).rows);

  console.log('--- Total planos en circulacion ---');
  console.table((await c.query('SELECT COUNT(*) AS total_planos FROM user_ship_blueprints')).rows);

  console.log('--- Por tipo de plano ---');
  console.table((await c.query(`
    SELECT bp.code, bp.name,
      COUNT(*) AS total_planos,
      COUNT(DISTINCT u.user_id) AS usuarios_distintos
    FROM user_ship_blueprints u
    JOIN ship_blueprints bp ON bp.id = u.blueprint_id
    GROUP BY bp.code, bp.name
    ORDER BY total_planos DESC
  `)).rows);

  console.log('--- Por origen (source) ---');
  console.table((await c.query("SELECT source, COUNT(*) AS n FROM user_ship_blueprints GROUP BY source ORDER BY n DESC")).rows);

  console.log('--- Top 10 usuarios con mas planos ---');
  console.table((await c.query(`
    SELECT p.username, COUNT(*) AS planos
    FROM user_ship_blueprints u
    LEFT JOIN profiles p ON p.id = u.user_id
    GROUP BY p.username
    ORDER BY planos DESC
    LIMIT 10
  `)).rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
