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

  // Buscar usuario
  const { rows: users } = await c.query(`SELECT id, username FROM profiles WHERE username ILIKE '%Yotun%'`);
  if (users.length === 0) {
    console.log('Usuario Yotun no encontrado');
    await c.end();
    return;
  }
  const user = users[0];

  // Buscar planeta principal del usuario
  const { rows: planets } = await c.query(`SELECT id, name FROM planets WHERE user_id = $1 ORDER BY created_at ASC`, [user.id]);
  if (planets.length === 0) {
    console.log('El usuario no tiene planetas');
    await c.end();
    return;
  }

  // Buscar Fragata Grande (ship_type)
  const { rows: ships } = await c.query(`SELECT id, code, name FROM ship_types WHERE name ILIKE '%Fragata Grande%' OR code ILIKE '%fragata_grande%'`);
  if (ships.length === 0) {
    console.log('No existe el tipo de nave Fragata Grande');
    await c.end();
    return;
  }
  const shipType = ships[0];

  // Buscar cantidad de Fragata Grande en todos los planetas del usuario
  const { rows: owned } = await c.query(`
    SELECT SUM(quantity) as total
    FROM planet_ships
    WHERE user_id = $1 AND ship_type_id = $2
  `, [user.id, shipType.id]);

  const total = owned[0]?.total || 0;
  console.log(`Usuario: ${user.username}`);
  console.log(`Fragata Grande: ${total}`);

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
