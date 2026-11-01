process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('--- CONFIG ANTES ---');
  console.table((await c.query('SELECT * FROM expedition_blueprint_drop_config WHERE id=1')).rows);

  console.log('--- DROPS HISTORICOS ---');
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='expedition_blueprint_drops'");
  console.log('cols:', cols.rows.map(r=>r.column_name).join(','));
  console.table((await c.query('SELECT COUNT(*) AS total_drops, COUNT(DISTINCT user_id) AS usuarios_distintos FROM expedition_blueprint_drops')).rows);

  console.log('--- TOTAL EXPEDICIONES (ultimos 30 dias) ---');
  console.table((await c.query(`
    SELECT COUNT(*) AS expediciones
    FROM fleets
    WHERE mission_type = 'expedition'
  `)).rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
