const { Client } = require('pg');

const EMAIL = 'armandobejarano20@gmail.com';

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

  const userRes = await c.query(
    `
    SELECT p.id, p.username
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE LOWER(u.email) = LOWER($1)
    LIMIT 1
    `,
    [EMAIL]
  );

  if (userRes.rows.length === 0) {
    console.log('No se encontró usuario con ese email.');
    return;
  }

  const userId = userRes.rows[0].id;
  console.log(`Usuario encontrado: ${userRes.rows[0].username} (${userId})`);

  const planetsRes = await c.query(
    `
    SELECT id, name, galaxy, solar_system, position, fields_used, fields_max, created_at
    FROM planets
    WHERE user_id = $1
      AND planet_type = 'planet'
      AND COALESCE(is_destroyed, false) = false
    ORDER BY created_at ASC
    `,
    [userId]
  );

  if (planetsRes.rows.length === 0) {
    console.log('El usuario no tiene planetas activos.');
    return;
  }

  const target = planetsRes.rows.find(p => Number(p.fields_max) === 203);

  if (!target) {
    console.log('No se encontró un planeta con fields_max = 203 para ese usuario.');
    console.log('Planetas actuales:');
    for (const p of planetsRes.rows) {
      console.log(`- ${p.name} [${p.galaxy}:${p.solar_system}:${p.position}] ${p.fields_used}/${p.fields_max}`);
    }
    return;
  }

  console.log(`Objetivo: ${target.name} [${target.galaxy}:${target.solar_system}:${target.position}] ${target.fields_used}/${target.fields_max}`);

  const updRes = await c.query(
    `
    UPDATE planets
    SET fields_max = 213
    WHERE id = $1
      AND fields_max = 203
    RETURNING id, name, galaxy, solar_system, position, fields_used, fields_max
    `,
    [target.id]
  );

  if (updRes.rows.length === 0) {
    console.log('No se pudo actualizar (quizá cambió antes del update).');
    return;
  }

  const p = updRes.rows[0];
  console.log(`Actualizado OK: ${p.name} [${p.galaxy}:${p.solar_system}:${p.position}] ${p.fields_used}/${p.fields_max}`);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await c.end(); } catch (_) {}
  });
