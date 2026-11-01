// Buff: satelites a todos los planetas (energia positiva), 10 estrellas por planeta, batallas 70/28.
const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
const ENERGY_FACTOR = 1.1;
const BATTLES_WON = 70;
const BATTLES_LOST = 28;
const DEATHSTARS_PER_PLANET = 10;

const ceil = Math.ceil, floor = Math.floor, pow = Math.pow, max = Math.max;

function metalCons(l)   { return l===0?0:ceil(10*l*pow(ENERGY_FACTOR,l)); }
function crystalCons(l) { return l===0?0:ceil(10*l*pow(ENERGY_FACTOR,l)); }
function deutCons(l)    { return l===0?0:ceil(20*l*pow(ENERGY_FACTOR,l)); }
function solarPlantEnergy(l, pos) {
  if (l===0) return 0;
  const posFactor = max(0.75, 1 + (8 - pos) * 0.025);
  return floor(20*l*pow(ENERGY_FACTOR,l)*posFactor);
}
function fusionEnergy(l, etech) {
  if (l===0) return 0;
  return floor(30*l*pow(1.05 + etech*0.01, l));
}
function satEnergy(tempMax) { return floor((tempMax + 160) / 6); }

(async () => {
  await c.connect();

  const sat = (await c.query(`SELECT id FROM ship_types WHERE code='solar_satellite'`)).rows[0].id;
  const ds  = (await c.query(`SELECT id FROM ship_types WHERE code='deathstar'`)).rows[0].id;

  // energy_tech para fusion
  const eTech = (await c.query(`
    SELECT ut.level FROM user_technologies ut
    JOIN technology_types tt ON tt.id=ut.technology_type_id
    WHERE ut.user_id=$1 AND tt.code='energy_tech'
  `, [USER_ID])).rows[0]?.level ?? 0;

  const planets = (await c.query(`SELECT id, name, position, temp_max FROM planets WHERE user_id=$1 ORDER BY is_main_planet DESC, name`, [USER_ID])).rows;

  for (const pl of planets) {
    // niveles
    const blds = (await c.query(`
      SELECT bt.code, pb.level FROM planet_buildings pb
      JOIN building_types bt ON bt.id=pb.building_type_id
      WHERE pb.planet_id=$1
    `, [pl.id])).rows;
    const bm = Object.fromEntries(blds.map(r => [r.code, r.level]));

    const consumption = metalCons(bm.metal_mine||0) + crystalCons(bm.crystal_mine||0) + deutCons(bm.deuterium_synthesizer||0);
    const production = solarPlantEnergy(bm.solar_plant||0, pl.position) + fusionEnergy(bm.fusion_reactor||0, eTech);
    const deficit = consumption - production;
    const perSat = satEnergy(pl.temp_max);
    let satsNeeded = deficit > 0 ? Math.ceil(deficit / perSat * 1.4) : 0; // 40% margen
    // Asegurar mínimo decente
    if (satsNeeded < 80) satsNeeded = 80;

    // Solo subir si actual < satsNeeded
    await c.query(`
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = GREATEST(planet_ships.quantity, EXCLUDED.quantity)
    `, [pl.id, sat, satsNeeded]);

    // 10 Estrellas de la Muerte
    await c.query(`
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = GREATEST(planet_ships.quantity, EXCLUDED.quantity)
    `, [pl.id, ds, DEATHSTARS_PER_PLANET]);

    console.log(`${pl.name}: cons=${consumption} prod=${production} deficit=${deficit} perSat=${perSat} → sats=${satsNeeded}, deathstars=${DEATHSTARS_PER_PLANET}`);
  }

  // Batallas
  await c.query(`
    UPDATE profiles
    SET battles_won = $2, battles_lost = $3, battles_draw = 0
    WHERE id = $1
  `, [USER_ID, BATTLES_WON, BATTLES_LOST]);
  console.log(`✓ batallas: ganadas=${BATTLES_WON}, perdidas=${BATTLES_LOST}, total=${BATTLES_WON+BATTLES_LOST}`);

  // Recalc puntos por flota
  await c.query(`SELECT update_player_points($1)`, [USER_ID]);

  console.log('\n--- VERIFICACION ---');
  const prof = await c.query(`SELECT username, battles_won, battles_lost, battles_draw, points_total, points_fleet FROM profiles WHERE id=$1`, [USER_ID]);
  console.log(prof.rows[0]);

  for (const pl of planets) {
    const ships = await c.query(`
      SELECT st.code, ps.quantity FROM planet_ships ps
      JOIN ship_types st ON st.id=ps.ship_type_id
      WHERE ps.planet_id=$1 AND st.code IN ('solar_satellite','deathstar')
      ORDER BY st.code
    `, [pl.id]);
    console.log(`${pl.name}:`, ships.rows.map(r => `${r.code}=${r.quantity}`).join(', '));
  }

  const rk = await c.query(`
    SELECT rank FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY points_total DESC) AS rank
      FROM profiles WHERE is_admin=false AND is_hidden=false
    ) x WHERE id=$1
  `, [USER_ID]);
  console.log(`\n>>> RANK: ${rk.rows[0].rank}`);

  await c.end();
})().catch(e => { console.error('❌', e); process.exit(1); });
