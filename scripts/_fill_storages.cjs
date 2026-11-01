// Llena almacenes de metal, cristal y deuterio en todos los planetas de Wolf King
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
  // 2. Para cada planeta, buscar capacidad de almacenes
  for (const pl of planets) {
    // Capacidad de cada recurso
    const blds = (await c.query(`
      SELECT bt.code, pb.level FROM planet_buildings pb
      JOIN building_types bt ON bt.id=pb.building_type_id
      WHERE pb.planet_id=$1 AND bt.code IN ('metal_storage','crystal_storage','deuterium_tank')
    `, [pl.id])).rows;
    const levels = Object.fromEntries(blds.map(x => [x.code, x.level]));
    // Fórmula oficial (idéntica a OGame):
    function storageCap(level) {
      return Math.floor(5000 * Math.floor(2.5 * Math.exp((20 * level) / 33)));
    }
    const metalMax = storageCap(levels.metal_storage||1);
    const crystalMax = storageCap(levels.crystal_storage||1);
    const deutMax = storageCap(levels.deuterium_tank||1);
    // 3. Setear recursos
    await c.query(`UPDATE planets SET metal=$2, crystal=$3, deuterium=$4 WHERE id=$1`, [pl.id, metalMax, crystalMax, deutMax]);
    console.log(`${pl.name}: metal=${metalMax}, crystal=${crystalMax}, deut=${deutMax}`);
  }
  await c.end();
})();
