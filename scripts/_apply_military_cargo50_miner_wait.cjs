// Apply two changes to bot_ai_tick:
// 1. Military: allow small_cargo + large_cargo up to 50 of each, counting BOTH planet_ships AND
//    ships currently in active fleets from this planet. If total >= 50 -> build 0.
// 2. Miner Phase H: only send a new transport if NO fleet is currently active from origin
//    (waits for cargoes to return), instead of allowing up to 3 simultaneous.
const { Client } = require('pg');
const fs = require('fs');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const r = await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  let src = r.rows[0].prosrc;

  const CR = '\r\n';

  // ------------------------------------------------------------------
  // 1a. small_cargo military branch: count planet + active fleet ships.
  //     Cap 50.
  // ------------------------------------------------------------------
  const oldSmallMil = [
    "ELSIF v_planet_role = 'military' THEN",
    "                  -- [WAR MACHINE v3] Militar NO construye small_cargo. Los mineros traen recursos.",
    "                  v_ship_qty := 0;",
    "                ELSIF v_planet_role = 'colonizer' THEN",
  ].join(CR);

  const newSmallMil = [
    "ELSIF v_planet_role = 'military' THEN",
    "                  -- [WAR MACHINE v4] Militar puede tener hasta 50 small_cargo (para loot tras atacar).",
    "                  -- Contamos naves en planeta + naves en vuelo desde este planeta.",
    "                  DECLARE v_total_small int;",
    "                  BEGIN",
    "                    SELECT v_existing_ship_count + COALESCE(SUM(fs.quantity), 0)",
    "                      INTO v_total_small",
    "                      FROM fleets f",
    "                      LEFT JOIN fleet_ships fs ON fs.fleet_id = f.id AND fs.ship_type_id = v_ship.id",
    "                     WHERE f.origin_planet_id = v_planet.id AND f.is_completed = false;",
    "                    v_total_small := COALESCE(v_total_small, v_existing_ship_count);",
    "                    IF v_total_small >= 50 THEN",
    "                      v_ship_qty := 0;",
    "                    ELSE",
    "                      v_ship_qty := LEAST(10, 50 - v_total_small);",
    "                    END IF;",
    "                  END;",
    "                ELSIF v_planet_role = 'colonizer' THEN",
  ].join(CR);

  if (!src.includes(oldSmallMil)) { console.error('❌ small_cargo military anchor not found'); process.exit(1); }
  src = src.replace(oldSmallMil, newSmallMil);
  console.log('✅ small_cargo military: cap 50 incluyendo flotas en vuelo');

  // ------------------------------------------------------------------
  // 1b. large_cargo military branch: same, cap 50.
  // ------------------------------------------------------------------
  const oldLargeMil = [
    "ELSIF v_planet_role = 'military' THEN",
    "                  -- [WAR MACHINE v3] Militar NO construye large_cargo. Los mineros traen recursos.",
    "                  v_ship_qty := 0;",
    "                ELSIF v_planet_role = 'colonizer' THEN",
  ].join(CR);

  const newLargeMil = [
    "ELSIF v_planet_role = 'military' THEN",
    "                  -- [WAR MACHINE v4] Militar puede tener hasta 50 large_cargo (para loot tras atacar).",
    "                  DECLARE v_total_large int;",
    "                  BEGIN",
    "                    SELECT v_existing_ship_count + COALESCE(SUM(fs.quantity), 0)",
    "                      INTO v_total_large",
    "                      FROM fleets f",
    "                      LEFT JOIN fleet_ships fs ON fs.fleet_id = f.id AND fs.ship_type_id = v_ship.id",
    "                     WHERE f.origin_planet_id = v_planet.id AND f.is_completed = false;",
    "                    v_total_large := COALESCE(v_total_large, v_existing_ship_count);",
    "                    IF v_total_large >= 50 THEN",
    "                      v_ship_qty := 0;",
    "                    ELSE",
    "                      v_ship_qty := LEAST(10, 50 - v_total_large);",
    "                    END IF;",
    "                  END;",
    "                ELSIF v_planet_role = 'colonizer' THEN",
  ].join(CR);

  if (!src.includes(oldLargeMil)) { console.error('❌ large_cargo military anchor not found'); process.exit(1); }
  src = src.replace(oldLargeMil, newLargeMil);
  console.log('✅ large_cargo military: cap 50 incluyendo flotas en vuelo');

  // ------------------------------------------------------------------
  // 2. Also re-add large_cargo + small_cargo to military ship priority array
  //    so it actually builds them when below the cap.
  // ------------------------------------------------------------------
  const oldMilArr = [
    "'destroyer',",
    "              'bomber',",
    "              'battlecruiser',",
    "              'battleship',",
    "              'cruiser',",
    "              'heavy_fighter',",
    "              'light_fighter',",
    "              'recycler',",
    "              'espionage_probe',",
    "              'colony_ship'",
    "            ];",
  ].join(CR);

  const newMilArr = [
    "'destroyer',",
    "              'bomber',",
    "              'battlecruiser',",
    "              'battleship',",
    "              'cruiser',",
    "              'heavy_fighter',",
    "              'light_fighter',",
    "              'large_cargo',",
    "              'small_cargo',",
    "              'recycler',",
    "              'espionage_probe',",
    "              'colony_ship'",
    "            ];",
  ].join(CR);

  if (!src.includes(oldMilArr)) { console.error('❌ military priority array not found'); process.exit(1); }
  src = src.replace(oldMilArr, newMilArr);
  console.log('✅ military priority array: incluye large_cargo + small_cargo de nuevo');

  // ------------------------------------------------------------------
  // 3. Miner Phase H: require ZERO active fleets (wait for return).
  // ------------------------------------------------------------------
  const oldMinerFleets = "((v_planet_role = 'miner' AND v_origin_active_fleets < 3) OR (v_planet_role <> 'miner' AND v_origin_active_fleets = 0))";
  const newMinerFleets = "(v_origin_active_fleets = 0)";
  if (!src.includes(oldMinerFleets)) { console.error('❌ miner active_fleets clause not found'); process.exit(1); }
  src = src.replace(oldMinerFleets, newMinerFleets);
  console.log('✅ Miner Phase H: espera a que cargueros regresen (active_fleets = 0)');

  // ------------------------------------------------------------------
  // Write migration & apply.
  // ------------------------------------------------------------------
  const sigRes = await c.query(`SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, l.lanname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  const { args, ret, lanname } = sigRes.rows[0];
  const sql = `CREATE OR REPLACE FUNCTION public.bot_ai_tick(${args}) RETURNS ${ret} LANGUAGE ${lanname} AS $BOTAITICK$\n${src}\n$BOTAITICK$;`;
  fs.writeFileSync('supabase/migrations/20260422_military_cargo50_miner_wait.sql', sql);
  console.log('Wrote migration, size:', sql.length);

  try {
    await c.query(sql);
    console.log('✅ bot_ai_tick updated');
  } catch (e) {
    console.error('❌ Error applying:', e.message);
  }

  await c.end();
})();
