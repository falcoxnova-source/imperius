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

  // Buscar Fragata Grande (ship_type)
  const { rows: ships } = await c.query(`SELECT id, code, name FROM ship_types WHERE name ILIKE '%Fragata Grande%' OR code ILIKE '%fragata_grande%'`);
  if (ships.length === 0) {
    console.log('No existe el tipo de nave Fragata Grande');
    await c.end();
    return;
  }
  const shipType = ships[0];

  // Buscar usuarios que tengan Fragata Grande
  const { rows: owners } = await c.query(`
    SELECT p.username, ps.quantity
    FROM planet_ships ps
    JOIN profiles p ON ps.user_id = p.id
    WHERE ps.ship_type_id = $1 AND ps.quantity > 0
    ORDER BY ps.quantity DESC
  `, [shipType.id]);

  if (owners.length === 0) {
    console.log('Ningún usuario tiene Fragata Grande');
  } else {
    owners.forEach(o => {
      console.log(`Usuario: ${o.username} - Fragata Grande: ${o.quantity}`);
    });
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
