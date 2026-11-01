const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {
  const u = await c.query(`SELECT p.id as planet_id, p.name, pr.username
    FROM profiles pr JOIN planets p ON p.user_id = pr.id
    WHERE pr.email = 'dark@gmail.com' AND p.is_main_planet = true`);
  if (!u.rows.length) { console.log('User not found'); c.end(); return; }
  const planet = u.rows[0];
  console.log(`User: ${planet.username}, Planet: ${planet.name}`);

  // Find ship type IDs
  const types = await c.query(`SELECT id, code, name FROM ship_types WHERE code IN ('star_destroyer', 'deathstar')`);
  console.log('Ship types:', types.rows);

  for (const [code, qty] of [['deathstar', 1], ['star_destroyer', 54]]) {
    const type = types.rows.find(t => t.code === code);
    if (!type) { console.log(`Ship type ${code} not found!`); continue; }

    const exists = await c.query(`SELECT id, quantity FROM planet_ships WHERE planet_id = $1 AND ship_type_id = $2`, [planet.planet_id, type.id]);
    if (exists.rows.length) {
      await c.query(`UPDATE planet_ships SET quantity = quantity + $1 WHERE id = $2`, [qty, exists.rows[0].id]);
      console.log(`${type.name}: ${exists.rows[0].quantity} + ${qty} = ${exists.rows[0].quantity + qty}`);
    } else {
      await c.query(`INSERT INTO planet_ships (planet_id, ship_type_id, quantity) VALUES ($1, $2, $3)`, [planet.planet_id, type.id, qty]);
      console.log(`${type.name}: 0 -> ${qty}`);
    }
  }

  // Verify
  const ships = await c.query(`SELECT st.name, ps.quantity FROM planet_ships ps JOIN ship_types st ON st.id = ps.ship_type_id WHERE ps.planet_id = $1 AND ps.quantity > 0 ORDER BY ps.quantity DESC`, [planet.planet_id]);
  console.log('\nAll ships:');
  for (const s of ships.rows) console.log(`  ${s.name}: ${s.quantity}`);

  c.end();
}).catch(e => { console.error(e); c.end(); });
