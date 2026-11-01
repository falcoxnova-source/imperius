// Sube todos los almacenes a nivel 10 y los llena en todos los planetas de Wolf King
const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
(async () => {
  await c.connect();
  // 1. Buscar planetas
  const planets = (await c.query(`SELECT id, name FROM planets WHERE user_id=$1`, [USER_ID])).rows;
  // 2. Buscar ids de almacenes
  const btypes = (await c.query(`SELECT id, code FROM building_types WHERE code IN ('metal_storage','crystal_storage','deuterium_tank')`)).rows;
  const ids = Object.fromEntries(btypes.map(x => [x.code, x.id]));
  // 3. Subir almacenes a nivel 10
  for (const pl of planets) {
    for (const [code, id] of Object.entries(ids)) {
      await c.query(`
        INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
        VALUES ($1, $2, 10, false)
        ON CONFLICT (planet_id, building_type_id)
        DO UPDATE SET level = 10, is_upgrading = false, upgrade_end_time = NULL
      `, [pl.id, id]);
    }
  }
  // 4. Calcular capacidad y llenar
  function storageCap(level) {
    return Math.floor(5000 * Math.floor(2.5 * Math.exp((20 * level) / 33)));
  }
  const max = storageCap(10);
  for (const pl of planets) {
    await c.query(`
      UPDATE planet_resources SET metal=$2, crystal=$3, deuterium=$4 WHERE planet_id=$1
    `, [pl.id, max, max, max]);
    console.log(`${pl.name}: almacenes=10, metal=${max}, crystal=${max}, deut=${max}`);
  }
  await c.end();
})();
