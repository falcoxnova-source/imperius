// Buff Wolf King para entrar en TOP 32 + crear Estrella de la Muerte (x10).
// Idempotente: usa GREATEST para no bajar niveles existentes.
const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
const MAIN    = '4ae2e0ea-9112-41f2-8a83-c17f6001e254';

// ===== EDIFICIOS PLANETA PRINCIPAL =====
// Calculados para sumar ~465k puntos de edificios (target rank 32: 472k-484k)
const BUILDINGS = {
  metal_mine: 35,             // ~174,733 pts
  crystal_mine: 30,           // ~231,750 pts
  deuterium_synthesizer: 26,  // ~22,725 pts
  solar_plant: 30,            // ~40,267 pts
  shipyard: 12,               // requisito Estrella de la Muerte
  robotics_factory: 8,
  research_lab: 12,           // soporte para gravitones / hyperspace
  metal_storage: 8,
  crystal_storage: 8,
  deuterium_tank: 7,
};

// ===== TECNOLOGIAS =====
// Requisitos directos Estrella de la Muerte:
//   hyperspace_drive 7, hyperspace_tech 6, graviton_tech 1
const TECHS = {
  hyperspace_tech: 6,
  hyperspace_drive: 7,
  graviton_tech: 1,
  energy_tech: 12,    // requisito para grav
  laser_tech: 8,      // ya esta
  ion_tech: 6,        // ya esta
  plasma_tech: 5,
};

const DEATHSTAR_QTY = 10;

(async () => {
  await c.connect();

  console.log('--- ANTES ---');
  const before = await c.query(`SELECT username, points_total, points_buildings, points_research, points_fleet, points_defense FROM profiles WHERE id=$1`, [USER_ID]);
  console.log(before.rows[0]);

  // 1) Edificios
  for (const [code, level] of Object.entries(BUILDINGS)) {
    const bt = await c.query(`SELECT id FROM building_types WHERE code=$1`, [code]);
    if (!bt.rows[0]) { console.warn('NO building', code); continue; }
    const btid = bt.rows[0].id;
    await c.query(`
      INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
      VALUES ($1, $2, $3, false)
      ON CONFLICT (planet_id, building_type_id)
      DO UPDATE SET level = GREATEST(planet_buildings.level, EXCLUDED.level), is_upgrading = false, upgrade_end_time = NULL
    `, [MAIN, btid, level]);
  }
  console.log('✓ edificios actualizados');

  // 2) Tecnologias
  for (const [code, level] of Object.entries(TECHS)) {
    const tt = await c.query(`SELECT id FROM technology_types WHERE code=$1`, [code]);
    if (!tt.rows[0]) { console.warn('NO tech', code); continue; }
    const ttid = tt.rows[0].id;
    await c.query(`
      INSERT INTO user_technologies (user_id, technology_type_id, level, is_researching)
      VALUES ($1, $2, $3, false)
      ON CONFLICT (user_id, technology_type_id)
      DO UPDATE SET level = GREATEST(user_technologies.level, EXCLUDED.level), is_researching = false, research_end_time = NULL
    `, [USER_ID, ttid, level]);
  }
  console.log('✓ tecnologias actualizadas');

  // 3) 10 Estrellas de la Muerte en planeta principal
  const dsId = (await c.query(`SELECT id FROM ship_types WHERE code='deathstar'`)).rows[0].id;
  await c.query(`
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction)
    VALUES ($1, $2, $3, 0)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = GREATEST(planet_ships.quantity, EXCLUDED.quantity)
  `, [MAIN, dsId, DEATHSTAR_QTY]);
  console.log('✓ 10 Estrellas de la Muerte');

  // 4) Recalcular puntos
  await c.query(`SELECT update_player_points($1)`, [USER_ID]);
  console.log('✓ puntos recalculados');

  // 5) Verificar ranking
  console.log('\n--- DESPUES ---');
  const after = await c.query(`SELECT username, points_total, points_buildings, points_research, points_fleet, points_defense FROM profiles WHERE id=$1`, [USER_ID]);
  console.log(after.rows[0]);

  console.log('\n--- TOP 30-35 ---');
  const top = await c.query(`
    SELECT username, points_total
    FROM profiles
    WHERE is_admin=false AND is_hidden=false
    ORDER BY points_total DESC
    LIMIT 35
  `);
  top.rows.forEach((r,i) => {
    const mark = (r.username === 'Wolf King') ? ' <-- WOLF KING' : '';
    if (i+1 >= 28 && i+1 <= 35) console.log(`${i+1}. ${r.username} -> ${r.points_total}${mark}`);
  });

  // Posicion exacta
  const rank = await c.query(`
    SELECT rank FROM (
      SELECT id, username, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
      FROM profiles WHERE is_admin=false AND is_hidden=false
    ) x WHERE id=$1
  `, [USER_ID]);
  console.log(`\n>>> Wolf King rank: ${rank.rows[0].rank}`);

  await c.end();
})().catch(e => { console.error('❌', e); process.exit(1); });
