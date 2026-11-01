// Recalcular satelites necesarios en colonias tras subida de minas
const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
const ENERGY_FACTOR = 1.1;
const ceil=Math.ceil, floor=Math.floor, pow=Math.pow, max=Math.max;

const cons = (l, base) => l===0 ? 0 : ceil(base * l * pow(ENERGY_FACTOR, l));
const metalCons   = l => cons(l, 10);
const crystalCons = l => cons(l, 10);
const deutCons    = l => cons(l, 20);
const solarPlantE = (l, pos) => l===0 ? 0 : floor(20*l*pow(ENERGY_FACTOR,l)*max(0.75, 1+(8-pos)*0.025));
const fusionE     = (l, et)  => l===0 ? 0 : floor(30*l*pow(1.05+et*0.01, l));
const satE        = t => floor((t+160)/6);

(async () => {
  await c.connect();
  const sat = (await c.query(`SELECT id FROM ship_types WHERE code='solar_satellite'`)).rows[0].id;
  const eTech = (await c.query(`
    SELECT ut.level FROM user_technologies ut
    JOIN technology_types tt ON tt.id=ut.technology_type_id
    WHERE ut.user_id=$1 AND tt.code='energy_tech'
  `, [USER_ID])).rows[0]?.level ?? 0;

  const planets = (await c.query(`SELECT id, name, position, temp_max FROM planets WHERE user_id=$1 ORDER BY is_main_planet DESC, name`, [USER_ID])).rows;

  for (const pl of planets) {
    const blds = (await c.query(`
      SELECT bt.code, pb.level FROM planet_buildings pb
      JOIN building_types bt ON bt.id=pb.building_type_id
      WHERE pb.planet_id=$1
    `, [pl.id])).rows;
    const bm = Object.fromEntries(blds.map(r => [r.code, r.level]));

    const consumption = metalCons(bm.metal_mine||0) + crystalCons(bm.crystal_mine||0) + deutCons(bm.deuterium_synthesizer||0);
    const production  = solarPlantE(bm.solar_plant||0, pl.position) + fusionE(bm.fusion_reactor||0, eTech);
    const deficit = consumption - production;
    const perSat = satE(pl.temp_max);
    let satsNeeded = deficit > 0 ? Math.ceil(deficit / perSat * 1.4) : 80; // 40% margen
    if (satsNeeded < 80) satsNeeded = 80;

    // Subir SOLO si no tiene ya suficientes
    await c.query(`
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = GREATEST(planet_ships.quantity, EXCLUDED.quantity)
    `, [pl.id, sat, satsNeeded]);

    const finalQ = (await c.query(`SELECT quantity FROM planet_ships WHERE planet_id=$1 AND ship_type_id=$2`, [pl.id, sat])).rows[0].quantity;
    const newProd = production + finalQ * perSat;
    const margen = newProd - consumption;
    console.log(`${pl.name}: cons=${consumption} prod=${production} déficit=${deficit} perSat=${perSat} → sats=${finalQ} → energía neta=+${margen}`);
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
