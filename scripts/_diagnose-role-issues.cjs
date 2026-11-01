const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();

  console.log('=== Roles por planetas ===');
  const roles = await c.query(`
    SELECT COALESCE(autopilot_role, 'balanced') AS role, COUNT(*)::int AS n
    FROM planets
    WHERE planet_type='planet' AND NOT is_destroyed
    GROUP BY 1
    ORDER BY 2 DESC
  `);
  console.table(roles.rows);

  console.log('\n=== Militares: desbloqueo de naves capitales ===');
  const militaryUnlock = await c.query(`
    WITH mil_users AS (
      SELECT DISTINCT user_id
      FROM planets
      WHERE planet_type='planet' AND NOT is_destroyed
        AND COALESCE(autopilot_role,'balanced')='military'
    ), tech AS (
      SELECT mu.user_id,
        COALESCE(MAX(CASE WHEN tt.code='hyperspace_drive' THEN ut.level END),0) AS hyper_drive,
        COALESCE(MAX(CASE WHEN tt.code='hyperspace_tech' THEN ut.level END),0) AS hyper_tech,
        COALESCE(MAX(CASE WHEN tt.code='plasma_tech' THEN ut.level END),0) AS plasma_tech,
        COALESCE(MAX(CASE WHEN tt.code='laser_tech' THEN ut.level END),0) AS laser_tech,
        COALESCE(MAX(CASE WHEN tt.code='impulse_drive' THEN ut.level END),0) AS impulse_drive,
        COALESCE(MAX(CASE WHEN tt.code='ion_tech' THEN ut.level END),0) AS ion_tech
      FROM mil_users mu
      LEFT JOIN user_technologies ut ON ut.user_id = mu.user_id
      LEFT JOIN technology_types tt ON tt.id = ut.technology_type_id
      GROUP BY mu.user_id
    )
    SELECT
      COUNT(*)::int AS military_empires,
      COUNT(*) FILTER (WHERE hyper_drive >= 6 AND hyper_tech >= 5)::int AS unlock_destroyer,
      COUNT(*) FILTER (WHERE impulse_drive >= 6 AND plasma_tech >= 5)::int AS unlock_bomber,
      COUNT(*) FILTER (WHERE hyper_drive >= 5 AND hyper_tech >= 5 AND laser_tech >= 12)::int AS unlock_battlecruiser,
      COUNT(*) FILTER (WHERE ion_tech >= 2 AND impulse_drive >= 4)::int AS unlock_cruiser
    FROM tech
  `);
  console.table(militaryUnlock.rows);

  console.log('\n=== Producción reciente de naves (últimas 24h) en planetas militares ===');
  const militaryProd = await c.query(`
    SELECT st.code, SUM(sq.quantity)::bigint AS total_qty
    FROM shipyard_queue sq
    JOIN planets p ON p.id = sq.planet_id
    JOIN ship_types st ON st.id = sq.ship_type_id
    WHERE sq.item_type='ship'
      AND p.planet_type='planet'
      AND NOT p.is_destroyed
      AND COALESCE(p.autopilot_role,'balanced')='military'
      AND sq.created_at >= NOW() - interval '24 hours'
    GROUP BY st.code
    ORDER BY total_qty DESC
    LIMIT 12
  `);
  console.table(militaryProd.rows);

  console.log('\n=== Inventario actual de naves en planetas militares ===');
  const militaryStock = await c.query(`
    SELECT st.code, SUM(ps.quantity)::bigint AS total_qty
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE p.planet_type='planet'
      AND NOT p.is_destroyed
      AND COALESCE(p.autopilot_role,'balanced')='military'
      AND ps.quantity > 0
    GROUP BY st.code
    ORDER BY total_qty DESC
    LIMIT 15
  `);
  console.table(militaryStock.rows);

  console.log('\n=== Mineros listos para transportar vs bloqueados por flota activa ===');
  const minersTransport = await c.query(`
    WITH miners AS (
      SELECT p.id AS planet_id, p.user_id, p.galaxy, p.solar_system, p.position,
             COALESCE(pr.metal,0) AS metal, COALESCE(pr.crystal,0) AS crystal, COALESCE(pr.deuterium,0) AS deuterium
      FROM planets p
      JOIN planet_resources pr ON pr.planet_id = p.id
      WHERE p.planet_type='planet' AND NOT p.is_destroyed
        AND COALESCE(p.autopilot_role,'balanced')='miner'
    ), cargo AS (
      SELECT m.planet_id,
             COALESCE(SUM(CASE WHEN st.code='small_cargo' THEN ps.quantity ELSE 0 END),0)::int AS small_cargo,
             COALESCE(SUM(CASE WHEN st.code='large_cargo' THEN ps.quantity ELSE 0 END),0)::int AS large_cargo
      FROM miners m
      LEFT JOIN planet_ships ps ON ps.planet_id = m.planet_id
      LEFT JOIN ship_types st ON st.id = ps.ship_type_id
      GROUP BY m.planet_id
    ), active AS (
      SELECT f.origin_planet_id AS planet_id, COUNT(*)::int AS active_fleets
      FROM fleets f
      WHERE f.is_completed = false
      GROUP BY f.origin_planet_id
    )
    SELECT
      COUNT(*)::int AS miners_total,
      COUNT(*) FILTER (WHERE (m.metal > 15000 OR m.crystal > 12000 OR m.deuterium > 5000))::int AS pass_resource_trigger,
      COUNT(*) FILTER (WHERE (c.small_cargo + c.large_cargo) >= 2)::int AS pass_cargo_trigger,
      COUNT(*) FILTER (WHERE COALESCE(a.active_fleets,0) = 0)::int AS pass_no_active_fleet,
      COUNT(*) FILTER (
        WHERE (m.metal > 15000 OR m.crystal > 12000 OR m.deuterium > 5000)
          AND (c.small_cargo + c.large_cargo) >= 2
          AND COALESCE(a.active_fleets,0) = 0
      )::int AS fully_eligible_now
    FROM miners m
    JOIN cargo c ON c.planet_id = m.planet_id
    LEFT JOIN active a ON a.planet_id = m.planet_id
  `);
  console.table(minersTransport.rows);

  console.log('\n=== Transportes minero -> militar (últimas 24h) ===');
  const flow = await c.query(`
    SELECT COUNT(*)::int AS transports_24h
    FROM fleets f
    JOIN planets o ON o.id = f.origin_planet_id
    JOIN planets t ON t.galaxy = f.target_galaxy AND t.solar_system = f.target_system AND t.position = f.target_position AND t.planet_type='planet' AND NOT t.is_destroyed
    WHERE f.mission_type='transport'
      AND f.departure_time >= NOW() - interval '24 hours'
      AND COALESCE(o.autopilot_role,'balanced')='miner'
      AND COALESCE(t.autopilot_role,'balanced')='military'
  `);
  console.table(flow.rows);

  await c.end();
})();
