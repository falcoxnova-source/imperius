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

  const fn = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'bot_ai_tick'");
  const src = fn.rows[0]?.prosrc || '';

  const expectedShips = [
    'espionage_probe', 'small_cargo', 'large_cargo', 'recycler', 'colony_ship',
    'light_fighter', 'heavy_fighter', 'cruiser', 'battleship', 'battlecruiser', 'bomber', 'destroyer'
  ];

  const shipPriorityHasAll = expectedShips.every(code => src.includes(`'${code}'`));
  const hasRequirementChecks = src.includes('ship_requirements') && src.includes('defense_requirements');
  const hasAttackBranches = src.includes("mission_type = 'attack'") && src.includes('estimate_profile_combat_power');
  const hasSpyBranch = src.includes("mission_type = 'espionage'") && src.includes("v_last_spy_reports");
  const hasRecycleBranch = src.includes("mission_type = 'recycle'");
  const hasColonizeBranch = src.includes("mission_type = 'colonize'");
  const hasTransportBranch = src.includes("mission_type = 'transport'");
  const hasFleetSaveBranch = src.includes('fleet save') || src.includes('v_save_target');
  const hasRetaliationBranch = src.includes('retaliat') || src.includes('v_attacker_planet');

  console.log('=== ANALISIS DE CODIGO bot_ai_tick() ===');
  console.log({
    shipPriorityHasAll,
    hasRequirementChecks,
    hasAttackBranches,
    hasSpyBranch,
    hasRecycleBranch,
    hasColonizeBranch,
    hasTransportBranch,
    hasFleetSaveBranch,
    hasRetaliationBranch
  });

  // Ejecutar un tick para medir acciones
  const tick = await c.query('SELECT bot_ai_tick() AS result');
  console.log('\n=== RESULTADO DEL TICK ===');
  console.log(JSON.stringify(tick.rows[0].result, null, 2));

  // Misiones recientes (24h)
  const missions24h = await c.query(`
    SELECT f.mission_type, COUNT(*)::int AS total
    FROM fleets f
    JOIN profiles pr ON pr.id = f.user_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND f.departure_time > now() - interval '24 hours'
    GROUP BY f.mission_type
    ORDER BY total DESC
  `);
  console.log('\n=== MISIONES 24H (bots/autopilot) ===');
  console.table(missions24h.rows);

  // Ataques con retorno para ver actividad real
  const attacks24h = await c.query(`
    SELECT
      COUNT(*)::int AS attacks_total,
      SUM(CASE WHEN f.arrival_time IS NOT NULL THEN 1 ELSE 0 END)::int AS attacks_with_arrival,
      SUM(CASE WHEN f.return_time IS NOT NULL THEN 1 ELSE 0 END)::int AS attacks_with_return
    FROM fleets f
    JOIN profiles pr ON pr.id = f.user_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND f.mission_type = 'attack'
      AND f.departure_time > now() - interval '24 hours'
  `);
  console.log('\n=== ATAQUES 24H ===');
  console.log(attacks24h.rows[0]);

  // Naves disponibles en cuentas bot/autopilot (stock actual >0)
  const shipsOwned = await c.query(`
    SELECT st.code, COUNT(*)::int AS planets_with_stock, SUM(ps.quantity)::bigint AS total_qty
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    JOIN planets p ON p.id = ps.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND ps.quantity > 0
    GROUP BY st.code
    ORDER BY total_qty DESC
  `);
  console.log('\n=== STOCK DE NAVES ACTUAL (bots/autopilot) ===');
  console.table(shipsOwned.rows);

  const ownedCodes = new Set(shipsOwned.rows.map(r => r.code));
  const missingOwned = expectedShips.filter(s => !ownedCodes.has(s));
  console.log('\nNaves sin stock actual detectado:', missingOwned.length ? missingOwned : 'ninguna');

  // Defensas actuales
  const defensesOwned = await c.query(`
    SELECT dt.code, COUNT(*)::int AS planets_with_stock, SUM(pd.quantity)::bigint AS total_qty
    FROM planet_defenses pd
    JOIN defense_types dt ON dt.id = pd.defense_type_id
    JOIN planets p ON p.id = pd.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND pd.quantity > 0
    GROUP BY dt.code
    ORDER BY total_qty DESC
  `);
  console.log('\n=== STOCK DE DEFENSAS ACTUAL (bots/autopilot) ===');
  console.table(defensesOwned.rows);

  // En cola reciente (15min)
  const queue15m = await c.query(`
    SELECT sq.item_type,
           COALESCE(st.code, dt.code) AS code,
           COUNT(*)::int AS queued_items,
           SUM(sq.quantity)::bigint AS queued_qty
    FROM shipyard_queue sq
    JOIN planets p ON p.id = sq.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN ship_types st ON st.id = sq.ship_type_id
    LEFT JOIN defense_types dt ON dt.id = sq.defense_type_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND sq.start_time > now() - interval '15 minutes'
    GROUP BY sq.item_type, COALESCE(st.code, dt.code)
    ORDER BY queued_items DESC, queued_qty DESC
  `);
  console.log('\n=== COLA ASTILLERO 15M (bots/autopilot) ===');
  console.table(queue15m.rows);

  await c.end();
})();
