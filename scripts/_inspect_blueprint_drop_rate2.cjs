process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log('Drops por usuario:');
  console.table((await c.query(`
    SELECT p.username, COUNT(*) AS drops
    FROM expedition_blueprint_drops d
    LEFT JOIN profiles p ON p.id = d.user_id
    GROUP BY p.username ORDER BY drops DESC LIMIT 20
  `)).rows);
  console.log('Drops por blueprint:');
  console.table((await c.query(`
    SELECT bp.code, COUNT(*) AS n
    FROM expedition_blueprint_drops d
    JOIN ship_blueprints bp ON bp.id = d.blueprint_id
    GROUP BY bp.code
  `)).rows);
  console.log('Rango fechas:');
  console.table((await c.query("SELECT MIN(dropped_at) AS min_d, MAX(dropped_at) AS max_d FROM expedition_blueprint_drops")).rows);
  console.log('Expediciones retornadas total (status returning o completed):');
  console.table((await c.query("SELECT status, COUNT(*) FROM fleets WHERE mission_type='expedition' GROUP BY status")).rows);
  await c.end();
})();
