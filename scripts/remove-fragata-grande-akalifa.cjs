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

  // Buscar usuario y planetas
  const { rows: userRows } = await c.query(`SELECT id FROM profiles WHERE username ILIKE '%Akalifa%'`);
  if (userRows.length === 0) {
    console.log('Usuario Akalifa no encontrado');
    await c.end();
    return;
  }
  const userId = userRows[0].id;

  // Buscar todos los planetas del usuario
  const { rows: planetRows } = await c.query(`SELECT id FROM planets WHERE user_id = $1`, [userId]);
  if (planetRows.length === 0) {
    console.log('Akalifa no tiene planetas');
    await c.end();
    return;
  }

  // Buscar Fragata Grande (ship_type)
  const { rows: ships } = await c.query(`SELECT id FROM ship_types WHERE name ILIKE '%Fragata Grande%' OR code ILIKE '%fragata_grande%'`);
  if (ships.length === 0) {
    console.log('No existe el tipo de nave Fragata Grande');
    await c.end();
    return;
  }
  const shipTypeId = ships[0].id;

  // Quitar la nave en todos los planetas del usuario
  const { rowCount } = await c.query(`UPDATE planet_ships SET quantity = 0 WHERE planet_id = ANY($1::uuid[]) AND ship_type_id = $2`, [planetRows.map(p => p.id), shipTypeId]);
  if (rowCount > 0) {
    console.log('Fragata Grande eliminada correctamente de Akalifa');
  } else {
    console.log('No se encontró la nave para eliminar en Akalifa');
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
