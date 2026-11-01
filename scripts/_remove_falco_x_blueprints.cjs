process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('--- ANTES: Planos Falco-X en inventario ---');
  console.table((await c.query(`
    SELECT p.username, COUNT(*) AS planos
    FROM user_ship_blueprints u
    JOIN ship_blueprints bp ON bp.id = u.blueprint_id
    LEFT JOIN profiles p ON p.id = u.user_id
    WHERE bp.code = 'bp_falco_x_clasica'
    GROUP BY p.username
    ORDER BY planos DESC
  `)).rows);

  console.log('--- ANTES: Listings P2P activos del Falco-X ---');
  console.table((await c.query(`
    SELECT id, seller_id, status, total_price
    FROM blueprint_market_listings
    WHERE item_code = 'bp_falco_x_clasica'
      AND status IN ('active','listed','open')
  `)).rows.length ? (await c.query(`
    SELECT id, seller_id, status, total_price FROM blueprint_market_listings
    WHERE item_code = 'bp_falco_x_clasica' AND status IN ('active','listed','open')
  `)).rows : [{ info: 'sin listings activos o tabla con otro nombre' }]);

  await c.query('BEGIN');
  try {
    // 1) Borrar del inventario directo
    const r1 = await c.query(`
      DELETE FROM user_ship_blueprints
      WHERE blueprint_id = (SELECT id FROM ship_blueprints WHERE code = 'bp_falco_x_clasica')
      RETURNING user_id
    `);
    console.log(`Filas borradas en user_ship_blueprints: ${r1.rowCount}`);

    // 2) Cancelar listings P2P en escrow del Falco-X (si la tabla existe)
    try {
      const r2 = await c.query(`
        UPDATE blueprint_market_listings
        SET status = 'cancelled_admin'
        WHERE item_code = 'bp_falco_x_clasica'
          AND status IN ('active','listed','open')
        RETURNING id
      `);
      console.log(`Listings P2P del Falco-X cancelados: ${r2.rowCount}`);
    } catch (err) {
      console.log('Aviso listings:', err.message);
    }

    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }

  console.log('--- DESPUES: Inventario Falco-X ---');
  console.table((await c.query(`
    SELECT p.username, COUNT(*) AS planos
    FROM user_ship_blueprints u
    JOIN ship_blueprints bp ON bp.id = u.blueprint_id
    LEFT JOIN profiles p ON p.id = u.user_id
    WHERE bp.code = 'bp_falco_x_clasica'
    GROUP BY p.username
  `)).rows);

  console.log('--- Inventario global tras limpieza ---');
  console.table((await c.query(`
    SELECT bp.code, COUNT(*) AS total, COUNT(DISTINCT u.user_id) AS usuarios
    FROM user_ship_blueprints u
    JOIN ship_blueprints bp ON bp.id = u.blueprint_id
    GROUP BY bp.code
  `)).rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
