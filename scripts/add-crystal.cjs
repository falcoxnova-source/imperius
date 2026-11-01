const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  const { rows } = await client.query(`
    SELECT p.id, p.username, pl.id as planet_id, pl.name as planet_name, pr.crystal
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    JOIN planets pl ON pl.user_id = p.id AND pl.is_main_planet = true
    JOIN planet_resources pr ON pr.planet_id = pl.id
    WHERE LOWER(au.email) = LOWER('emanuelores1992@gmail.com')
  `);

  if (!rows.length) {
    console.log('Usuario no encontrado');
    await client.end();
    return;
  }

  const user = rows[0];
  console.log(`Usuario: ${user.username}`);
  console.log(`Planeta: ${user.planet_name} (${user.planet_id})`);
  console.log(`Cristal actual: ${Number(user.crystal).toLocaleString()}`);

  const upd = await client.query(
    'UPDATE planet_resources SET crystal = crystal + 3000000 WHERE planet_id = $1 RETURNING crystal',
    [user.planet_id]
  );

  console.log(`Cristal nuevo: ${Number(upd.rows[0].crystal).toLocaleString()}`);
  console.log('✅ +3,000,000 cristal agregado exitosamente');

  await client.end();
}

main().catch(e => { console.error(e.message); client.end(); });
