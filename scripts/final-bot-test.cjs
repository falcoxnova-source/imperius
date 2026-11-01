const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Boost resources again
  await c.query(`
    UPDATE planet_resources 
    SET metal = 500000, crystal = 300000, deuterium = 200000
    WHERE planet_id IN (
      SELECT pl.id FROM planets pl 
      JOIN profiles p ON p.id = pl.user_id 
      WHERE p.is_bot = true AND pl.planet_type = 'planet'
    )
  `);

  // Run many cycles with short waits
  let defFound = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(ok => setTimeout(ok, 2000));
    await c.query('SELECT optimized_global_queue_processor()');
    const tick = await c.query('SELECT bot_ai_tick()');
    const d = tick.rows[0].bot_ai_tick;
    
    if (d.defenses_queued > 0) {
      console.log('*** DEFENSES ACTIVE! Tick', i+1, JSON.stringify(d));
      defFound = true;
      break;
    }
    if (i % 10 === 0) {
      console.log('Tick', i+1, JSON.stringify(d));
    }
  }

  // Check ships built
  const ships = await c.query(`
    SELECT p.username, st.code as ship, ps.quantity
    FROM planet_ships ps
    JOIN planets pl ON pl.id = ps.planet_id
    JOIN profiles p ON p.id = pl.user_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE p.is_bot = true AND ps.quantity > 0
    ORDER BY p.username, st.code
    LIMIT 15
  `);
  if (ships.rows.length > 0) {
    console.log('\n=== BOT SHIPS BUILT ===');
    console.table(ships.rows);
  }

  // Check defenses built
  const defs = await c.query(`
    SELECT p.username, dt.code as defense, pd.quantity
    FROM planet_defenses pd
    JOIN planets pl ON pl.id = pd.planet_id
    JOIN profiles p ON p.id = pl.user_id
    JOIN defense_types dt ON dt.id = pd.defense_type_id
    WHERE p.is_bot = true AND pd.quantity > 0
    ORDER BY p.username, dt.code
    LIMIT 15
  `);
  if (defs.rows.length > 0) {
    console.log('\n=== BOT DEFENSES BUILT ===');
    console.table(defs.rows);
  }

  // Check shipyard queue (ships and defenses)
  const sq = await c.query(`
    SELECT p.username, sq.item_type, COALESCE(st.code, dt.code) as unit, sq.quantity, sq.quantity_completed
    FROM shipyard_queue sq
    JOIN planets pl ON pl.id=sq.planet_id
    JOIN profiles p ON p.id=pl.user_id
    LEFT JOIN ship_types st ON st.id=sq.ship_type_id
    LEFT JOIN defense_types dt ON dt.id=sq.defense_type_id
    WHERE p.is_bot = true
    LIMIT 15
  `);
  if (sq.rows.length > 0) {
    console.log('\n=== BOT SHIPYARD QUEUE ===');
    console.table(sq.rows);
  }

  // Check completed techs
  const techs = await c.query(`
    SELECT p.username, tt.code, ut.level, ut.is_researching
    FROM user_technologies ut
    JOIN profiles p ON p.id = ut.user_id
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE p.is_bot = true AND (ut.level > 0 OR ut.is_researching = true)
    ORDER BY p.username, tt.code
    LIMIT 15
  `);
  if (techs.rows.length > 0) {
    console.log('\n=== BOT TECHS ===');
    console.table(techs.rows);
  }

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
