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

  // Tablas plus_*
  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name LIKE 'plus_%'
    ORDER BY table_name
  `);
  console.log('Tablas plus_*:', tables.rows.map(r => r.table_name));

  const cols = await c.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('plus_subscriptions','plus_plans')
    ORDER BY table_name, ordinal_position
  `);
  console.table(cols.rows);

  const plans = await c.query(`SELECT * FROM plus_plans ORDER BY id`);
  console.log('\nPlanes disponibles:');
  console.table(plans.rows);

  // Localizar los 3 usuarios por email (auth.users.email)
  const users = await c.query(`
    SELECT u.id, u.email, p.username
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
    WHERE u.email IN ('dark@gmail.com','hernandezrojasreinel@gmail.com','samaileal01@gmail.com')
  `);
  console.log('\nUsuarios encontrados:');
  console.table(users.rows);

  await c.end();
})();
