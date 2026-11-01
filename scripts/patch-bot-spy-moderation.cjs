/**
 * Modera el espionaje de los bots/autopilot:
 *  - Baja la probabilidad de Phase E de 60% → 25%
 *  - Excluye objetivos que YA fueron espiados en las últimas 24h
 *    (evita el patrón "20 sondas al mismo jugador" que delata al NPC)
 *  - Excluye objetivos que el bot ya atacó en las últimas 24h
 */
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
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick'");
  let src = r.rows[0].prosrc;

  // 1) Baja la probabilidad de espionaje: 0.6 → 0.25
  const probNeedle = `Phase E: Espionage (60% chance per tick - not all bots spy every cycle)`;
  if (!src.includes(probNeedle)) throw new Error('No encontré cabecera Phase E');
  src = src.replace(probNeedle, 'Phase E: Espionage (25% chance per tick, skip targets already spied recently)');

  // Solo el primer v_phase_rand < 0.6 (Phase E)
  const probIfNeedle = /IF v_origin_active_fleets = 0 AND NOT v_fleet_action_taken AND v_probe_ship_type_id IS NOT NULL AND v_phase_rand < 0\.6 THEN/;
  if (!probIfNeedle.test(src)) throw new Error('No encontré IF phase E 0.6');
  src = src.replace(probIfNeedle, 'IF v_origin_active_fleets = 0 AND NOT v_fleet_action_taken AND v_probe_ship_type_id IS NOT NULL AND v_phase_rand < 0.25 THEN');

  // 2) Añadir filtros NOT EXISTS para objetivos ya espiados / ya atacados en 24h
  // Anclaje: el NOT EXISTS actual que evita duplicar flota espía activa.
  const filterNeedle = /(AND NOT EXISTS \(\r?\n\s*SELECT 1 FROM fleets f\r?\n\s*WHERE f\.user_id = v_bot\.id AND f\.origin_planet_id = v_planet\.id AND f\.target_galaxy = tp\.galaxy AND f\.target_system = tp\.solar_system AND f\.target_position = tp\.position AND f\.target_type = 'planet' AND f\.mission_type = 'espionage' AND f\.is_completed = false\r?\n\s*\))/;

  if (!filterNeedle.test(src)) throw new Error('No encontré NOT EXISTS de espionage activo');

  if (src.includes('-- [ANTI-SPAM SPY]')) {
    console.log('⚠️  Ya parcheado, no hago nada');
    await c.end();
    return;
  }

  src = src.replace(filterNeedle, `$1
              -- [ANTI-SPAM SPY] No re-espiar el mismo objetivo en 24h (lo delata como NPC)
              AND NOT EXISTS (
                SELECT 1 FROM fleets f2
                WHERE f2.user_id = v_bot.id
                  AND f2.target_galaxy = tp.galaxy
                  AND f2.target_system = tp.solar_system
                  AND f2.target_position = tp.position
                  AND f2.target_type = 'planet'
                  AND f2.mission_type = 'espionage'
                  AND f2.departure_time > now() - interval '24 hours'
              )
              -- [ANTI-SPAM SPY] No espiar a quien ya atacamos en 24h (ya tenemos info fresca)
              AND NOT EXISTS (
                SELECT 1 FROM fleets f3
                WHERE f3.user_id = v_bot.id
                  AND f3.target_galaxy = tp.galaxy
                  AND f3.target_system = tp.solar_system
                  AND f3.target_position = tp.position
                  AND f3.target_type = 'planet'
                  AND f3.mission_type = 'attack'
                  AND f3.departure_time > now() - interval '24 hours'
              )`);

  // Aplicar
  const funcDef = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='bot_ai_tick'`);
  const fullDef = funcDef.rows[0].def;
  const original = r.rows[0].prosrc;
  if (!fullDef.includes(original)) throw new Error('no localicé original en functiondef');
  await c.query(fullDef.replace(original, src));

  console.log('✅ Espionaje moderado aplicado (25% prob, skip targets espiados/atacados en 24h)');

  // Verificación + ejecución
  const t = await c.query('SELECT bot_ai_tick() AS r');
  console.log('\n=== Tick ejecutado ===');
  console.log(JSON.stringify(t.rows[0].r, null, 2));

  // Conteo de espionajes enviados en últimos 5 min vs 24h previo
  const stats = await c.query(`
    SELECT
      SUM(CASE WHEN f.departure_time > now() - interval '5 minutes' THEN 1 ELSE 0 END)::int AS spy_last_5min,
      SUM(CASE WHEN f.departure_time > now() - interval '1 hour' THEN 1 ELSE 0 END)::int AS spy_last_1h,
      SUM(CASE WHEN f.departure_time > now() - interval '24 hours' THEN 1 ELSE 0 END)::int AS spy_last_24h
    FROM fleets f
    JOIN profiles pr ON pr.id = f.user_id
    WHERE (pr.is_bot = true OR pr.autopilot_active = true)
      AND f.mission_type = 'espionage'
  `);
  console.log('\n=== Estadística espionaje bots/autopilot ===');
  console.table(stats.rows);

  // Top 5 víctimas con más espiones de bots en 24h (antes del parche)
  const victims = await c.query(`
    SELECT prd.username AS victim, COUNT(*)::int AS spies_24h
    FROM fleets f
    JOIN profiles pra ON pra.id = f.user_id
    LEFT JOIN planets tp ON tp.galaxy=f.target_galaxy AND tp.solar_system=f.target_system AND tp.position=f.target_position
    LEFT JOIN profiles prd ON prd.id = tp.user_id
    WHERE (pra.is_bot = true OR pra.autopilot_active = true)
      AND f.mission_type = 'espionage'
      AND f.departure_time > now() - interval '24 hours'
    GROUP BY prd.username
    ORDER BY spies_24h DESC
    LIMIT 5
  `);
  console.log('\n=== Top 5 víctimas de espionaje 24h (antes del parche) ===');
  console.table(victims.rows);

  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
