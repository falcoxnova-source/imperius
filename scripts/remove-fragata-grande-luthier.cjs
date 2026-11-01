const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Buscar usuario y planeta
  const { rows: userRows } = await c.query(`SELECT id FROM profiles WHERE username ILIKE '%Luthier%'`);
  if (userRows.length === 0) {
    console.log('Usuario Luthier no encontrado');
    await c.end();
    return;
  }
  const userId = userRows[0].id;

  const { rows: planetRows } = await c.query(`SELECT id FROM planets WHERE user_id = $1 AND name ILIKE '%Yotun%'`, [userId]);
  if (planetRows.length === 0) {
    console.log('Planeta Yotun no encontrado para Luthier');
    await c.end();
    return;
  }
  const planetId = planetRows[0].id;

  // Buscar Fragata Grande (ship_type)
  const { rows: ships } = await c.query(`SELECT id FROM ship_types WHERE name ILIKE '%Fragata Grande%' OR code ILIKE '%fragata_grande%'`);
  if (ships.length === 0) {
    console.log('No existe el tipo de nave Fragata Grande');
    await c.end();
    return;
  }
  const shipTypeId = ships[0].id;

  // Quitar la nave (poner cantidad en 0)
  const { rowCount } = await c.query(`UPDATE planet_ships SET quantity = 0 WHERE planet_id = $1 AND ship_type_id = $2`, [planetId, shipTypeId]);
  if (rowCount > 0) {
    console.log('Fragata Grande eliminada correctamente de Luthier en Yotun');
  } else {
    console.log('No se encontró la nave para eliminar');
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
