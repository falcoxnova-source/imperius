process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('=== USUARIOS QUE HAN RECIBIDO PLANOS (HISTORICO de drops) ===');
  console.table((await c.query(`
    SELECT p.username, COUNT(*)::int AS drops_recibidos,
           STRING_AGG(DISTINCT bp.code, ', ') AS tipos
    FROM expedition_blueprint_drops d
    JOIN ship_blueprints bp ON bp.id=d.blueprint_id
    LEFT JOIN profiles p ON p.id=d.user_id
    GROUP BY p.username ORDER BY drops_recibidos DESC
  `)).rows);

  console.log('=== USUARIOS CON PLANOS EN INVENTARIO AHORA ===');
  console.table((await c.query(`
    SELECT p.username, bp.code, COUNT(*)::int AS cantidad
    FROM user_ship_blueprints u
    JOIN ship_blueprints bp ON bp.id=u.blueprint_id
    LEFT JOIN profiles p ON p.id=u.user_id
    GROUP BY p.username, bp.code ORDER BY p.username
  `)).rows);

  console.log('=== RESUMEN GLOBAL ===');
  console.table((await c.query(`
    SELECT
      (SELECT COUNT(DISTINCT user_id) FROM expedition_blueprint_drops)::int AS usuarios_que_recibieron_drop_alguna_vez,
      (SELECT COUNT(*) FROM expedition_blueprint_drops)::int                AS drops_totales_historico,
      (SELECT COUNT(DISTINCT user_id) FROM user_ship_blueprints)::int       AS usuarios_con_planos_ahora,
      (SELECT COUNT(*) FROM user_ship_blueprints)::int                      AS planos_en_circulacion
  `)).rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
