// Script Node.js para conexión directa PostgreSQL (Supabase)
// Añade 200 naves de carga grandes y sube Astrofísica a nivel 8 para jenserfs@gmail.com
// Requiere: npm install pg

const { Client } = require('pg');

const PG_CONFIG = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnwdymjqicevgmlhij',
  password: 'Jfs.samsung1989*',
};

const USER_EMAIL = 'jenserfs@gmail.com';
const ASTROPHYSICS_TECH_ID = 16; // Ajusta si tu tabla usa otro ID para Astrofísica
const ASTROPHYSICS_LEVEL = 8; // Nivel para 5 planetas (4 colonias + principal)
const LARGE_CARGO_ID = 2; // Ajusta si tu tabla usa otro ID para Large Cargo
const LARGE_CARGO_AMOUNT = 200;

async function main() {
  const client = new Client(PG_CONFIG);
  await client.connect();
  try {
    // 1. Buscar el usuario
    const userRes = await client.query('SELECT id FROM profiles WHERE email = $1', [USER_EMAIL]);
    if (userRes.rowCount === 0) throw new Error('Usuario no encontrado');
    const userId = userRes.rows[0].id;

    // 2. Buscar el planeta principal
    const planetRes = await client.query('SELECT id FROM planets WHERE user_id = $1 AND is_main = true', [userId]);
    if (planetRes.rowCount === 0) throw new Error('Planeta principal no encontrado');
    const planetId = planetRes.rows[0].id;

    // 3. Añadir 200 naves de carga grandes
    const shipRes = await client.query('SELECT id, amount FROM planet_ships WHERE planet_id = $1 AND ship_type_id = $2', [planetId, LARGE_CARGO_ID]);
    if (shipRes.rowCount > 0) {
      // Ya existe, sumar
      const newAmount = Number(shipRes.rows[0].amount) + LARGE_CARGO_AMOUNT;
      await client.query('UPDATE planet_ships SET amount = $1 WHERE id = $2', [newAmount, shipRes.rows[0].id]);
      console.log(`Actualizadas Large Cargo a ${newAmount}`);
    } else {
      // No existe, crear registro
      await client.query('INSERT INTO planet_ships (planet_id, ship_type_id, amount) VALUES ($1, $2, $3)', [planetId, LARGE_CARGO_ID, LARGE_CARGO_AMOUNT]);
      console.log('Añadidas 200 Large Cargo');
    }

    // 4. Subir Astrofísica a nivel 8
    const techRes = await client.query('SELECT id, level FROM user_technologies WHERE user_id = $1 AND technology_id = $2', [userId, ASTROPHYSICS_TECH_ID]);
    if (techRes.rowCount > 0) {
      if (Number(techRes.rows[0].level) < ASTROPHYSICS_LEVEL) {
        await client.query('UPDATE user_technologies SET level = $1 WHERE id = $2', [ASTROPHYSICS_LEVEL, techRes.rows[0].id]);
        console.log('Astrofísica actualizada a nivel 8');
      } else {
        console.log('Astrofísica ya está en nivel suficiente');
      }
    } else {
      await client.query('INSERT INTO user_technologies (user_id, technology_id, level) VALUES ($1, $2, $3)', [userId, ASTROPHYSICS_TECH_ID, ASTROPHYSICS_LEVEL]);
      console.log('Astrofísica añadida a nivel 8');
    }

    console.log('¡Listo!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();