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
const STAR_DESTROYER_QTY = 5;
const ION_QTY = 50;
const GAUSS_QTY = 50;

(async () => {
  await client.connect();

  const userRes = await client.query(`SELECT id FROM auth.users WHERE email = $1`, [EMAIL]);
  if (userRes.rows.length === 0) throw new Error(`Usuario ${EMAIL} no encontrado`);
  const userId = userRes.rows[0].id;

  const sdRes = await client.query(`SELECT id FROM ship_types WHERE code = 'star_destroyer'`);
  if (sdRes.rows.length === 0) throw new Error('ship_type star_destroyer no existe');
  const starDestroyerId = sdRes.rows[0].id;

  const ionRes = await client.query(`SELECT id FROM defense_types WHERE code = 'ion_cannon'`);
  const gaussRes = await client.query(`SELECT id FROM defense_types WHERE code = 'gauss_cannon'`);
  if (!ionRes.rows.length || !gaussRes.rows.length) throw new Error('defense_types no encontradas');
  const ionId = ionRes.rows[0].id;
  const gaussId = gaussRes.rows[0].id;

  const planets = await client.query(`
    SELECT id, name FROM planets
    WHERE user_id = $1 AND planet_type = 'planet' AND NOT is_destroyed
  `, [userId]);

  console.log(`🎁 Regalando a ${EMAIL} en ${planets.rows.length} planetas...`);

  await client.query('BEGIN');
  try {
    for (const p of planets.rows) {
      // Naves: +5 star_destroyer
      await client.query(`
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (planet_id, ship_type_id)
        DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity
      `, [p.id, starDestroyerId, STAR_DESTROYER_QTY]);

      // Defensas: +50 ion, +50 gauss
      await client.query(`
        INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (planet_id, defense_type_id)
        DO UPDATE SET quantity = planet_defenses.quantity + EXCLUDED.quantity
      `, [p.id, ionId, ION_QTY]);

      await client.query(`
        INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (planet_id, defense_type_id)
        DO UPDATE SET quantity = planet_defenses.quantity + EXCLUDED.quantity
      `, [p.id, gaussId, GAUSS_QTY]);

      console.log(`   ✅ ${p.name}: +${STAR_DESTROYER_QTY} Destructor de Estrellas, +${ION_QTY} Cañón Iónico, +${GAUSS_QTY} Cañón de Gauss`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }

  // Verificación
  const verify = await client.query(`
    SELECT pl.name,
      COALESCE((SELECT quantity FROM planet_ships WHERE planet_id = pl.id AND ship_type_id = $2), 0) AS star_destroyers,
      COALESCE((SELECT quantity FROM planet_defenses WHERE planet_id = pl.id AND defense_type_id = $3), 0) AS ion_cannons,
      COALESCE((SELECT quantity FROM planet_defenses WHERE planet_id = pl.id AND defense_type_id = $4), 0) AS gauss_cannons
    FROM planets pl
    WHERE pl.user_id = $1 AND pl.planet_type = 'planet' AND NOT pl.is_destroyed
    ORDER BY pl.is_main_planet DESC, pl.name
  `, [userId, starDestroyerId, ionId, gaussId]);

  console.log('\n🔎 Verificación:');
  verify.rows.forEach(r => console.log(`   ${r.name}: ⭐${r.star_destroyers} 🔵${r.ion_cannons} 🟡${r.gauss_cannons}`));

  await client.end();
  console.log('\n🎉 Listo');
})().catch(async e => { console.error('❌', e.message); try { await client.end(); } catch {} process.exit(1); });
