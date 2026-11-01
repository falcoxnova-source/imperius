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
  const u = await c.query(
    `SELECT u.id, p.username FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.email=$1`,
    [email]
  );
  if (u.rows.length === 0) { console.log('User not found'); await c.end(); return; }
  const userId = u.rows[0].id;
  console.log(`User: ${u.rows[0].username} (${email})`);

  // Find star destroyer ship type
  const ship = await c.query(`SELECT id, code, name FROM ship_types WHERE code ILIKE '%star_destroyer%' OR name ILIKE '%destructor%estrella%'`);
  console.log('Ship matches:', ship.rows);
  if (ship.rows.length === 0) { console.log('Ship not found'); await c.end(); return; }
  const shipTypeId = ship.rows[0].id;
  console.log(`Using: ${ship.rows[0].name} (${ship.rows[0].code}) id=${shipTypeId}`);

  // Find homeworld (main planet)
  const planet = await c.query(`
    SELECT id, name, galaxy, solar_system, position
    FROM planets
    WHERE user_id=$1 AND planet_type='planet' AND is_destroyed=false
    ORDER BY created_at ASC
    LIMIT 1
  `, [userId]);
  if (planet.rows.length === 0) { console.log('No planet found'); await c.end(); return; }
  const p = planet.rows[0];
  console.log(`Planet: ${p.name} [${p.galaxy}:${p.solar_system}:${p.position}]`);

  await c.query(`
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES ($1, $2, 74)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + 74
  `, [p.id, shipTypeId]);

  const verify = await c.query(`SELECT quantity FROM planet_ships WHERE planet_id=$1 AND ship_type_id=$2`, [p.id, shipTypeId]);
  console.log(`Verification: ${ship.rows[0].name} cantidad actual = ${verify.rows[0].quantity}`);

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
