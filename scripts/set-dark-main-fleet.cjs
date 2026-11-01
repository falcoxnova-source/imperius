const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

const EMAIL = 'dark@gmail.com';
const TARGET_DEATHSTARS = 5;
const TARGET_STAR_DESTROYERS = 20;

(async () => {
  await client.connect();

  const userRes = await client.query(
    `SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`,
    [EMAIL]
  );
  if (!userRes.rows.length) throw new Error(`Usuario no encontrado: ${EMAIL}`);
  const userId = userRes.rows[0].id;

  const planetRes = await client.query(
    `SELECT id, name, galaxy, solar_system, position
     FROM planets
     WHERE user_id = $1
       AND planet_type = 'planet'
       AND NOT is_destroyed
     ORDER BY is_main_planet DESC NULLS LAST, created_at ASC NULLS LAST
     LIMIT 1`,
    [userId]
  );
  if (!planetRes.rows.length) throw new Error('No se encontró planeta principal');
  const planet = planetRes.rows[0];

  const dsTypeRes = await client.query(
    `SELECT id, code FROM ship_types WHERE code IN ('deathstar','death_star') ORDER BY CASE WHEN code='deathstar' THEN 0 ELSE 1 END LIMIT 1`
  );
  if (!dsTypeRes.rows.length) throw new Error('No existe ship_type deathstar/death_star');
  const deathstarType = dsTypeRes.rows[0];

  const sdTypeRes = await client.query(
    `SELECT id, code FROM ship_types WHERE code IN ('star_destroyer','destroyer') ORDER BY CASE WHEN code='star_destroyer' THEN 0 ELSE 1 END LIMIT 1`
  );
  if (!sdTypeRes.rows.length) throw new Error('No existe ship_type star_destroyer/destroyer');
  const starDestroyerType = sdTypeRes.rows[0];

  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (planet_id, ship_type_id)
       DO UPDATE SET quantity = EXCLUDED.quantity`,
      [planet.id, deathstarType.id, TARGET_DEATHSTARS]
    );

    await client.query(
      `INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (planet_id, ship_type_id)
       DO UPDATE SET quantity = EXCLUDED.quantity`,
      [planet.id, starDestroyerType.id, TARGET_STAR_DESTROYERS]
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }

  const verifyRes = await client.query(
    `SELECT st.code, ps.quantity
     FROM planet_ships ps
     JOIN ship_types st ON st.id = ps.ship_type_id
     WHERE ps.planet_id = $1
       AND st.code IN ($2, $3)
     ORDER BY st.code`,
    [planet.id, deathstarType.code, starDestroyerType.code]
  );

  console.log(`✅ Cuenta: ${EMAIL}`);
  console.log(`✅ Planeta principal: ${planet.name} [${planet.galaxy}:${planet.solar_system}:${planet.position}]`);
  for (const row of verifyRes.rows) {
    console.log(`✅ ${row.code}: ${row.quantity}`);
  }

  await client.end();
})().catch(async (e) => {
  console.error('❌', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
