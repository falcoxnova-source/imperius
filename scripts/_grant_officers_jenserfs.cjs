const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const email = 'jenserfs@gmail.com';
  const user = await c.query(
    `SELECT u.id, u.email, p.username FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.email = $1`,
    [email]
  );

  if (user.rows.length === 0) {
    console.log('Usuario no encontrado:', email);
    await c.end();
    return;
  }

  const u = user.rows[0];
  console.log(`Usuario: ${u.username} (${u.email})\n`);

  const officers = await c.query(`SELECT id, code, name FROM officer_types ORDER BY sort_order`);
  console.log(`Oficiales encontrados: ${officers.rows.length}`);

  for (const off of officers.rows) {
    await c.query(`
      INSERT INTO user_officers (user_id, officer_type_id, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '90 days')
      ON CONFLICT (user_id, officer_type_id)
      DO UPDATE SET expires_at = GREATEST(user_officers.expires_at, NOW() + INTERVAL '90 days')
    `, [u.id, off.id]);
    console.log(`  ${off.name} (${off.code}) -> activado 90 dias`);
  }

  console.log('\nVerificacion:');
  const verify = await c.query(`
    SELECT ot.code, ot.name, uo.expires_at, uo.expires_at > now() AS activo
    FROM user_officers uo
    JOIN officer_types ot ON ot.id = uo.officer_type_id
    WHERE uo.user_id = $1
    ORDER BY ot.sort_order
  `, [u.id]);
  console.table(verify.rows);

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
