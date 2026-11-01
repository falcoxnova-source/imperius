// [WAR MACHINE v5] Military focuses on capital ships when shipyard is high enough.
// - shipyard >= 7 (battleship unlocked): light_fighter qty = 0  -> save resources
// - shipyard >= 9 (destroyer unlocked): heavy_fighter cap 50 (only minimal escort)
// - shipyard >= 8 (bomber/battlecruiser): heavy_fighter cap 100
// - shipyard >= 7 (battleship): heavy_fighter cap 200
// - shipyard >= 5 (cruiser only): light_fighter cap 50 with small batches
// This forces accumulation of resources for capital ships instead of mass-fighter spam.
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
  const has = (s) => src.includes(s);

  // Detect line ending used inside prosrc (could be LF only)
  const useCR = src.includes('\r\n');
  const NL = useCR ? '\r\n' : '\n';

  // -----------------------------------------------------------------------
  // 1. light_fighter military branch
  // -----------------------------------------------------------------------
  const oldLight = [
    "WHEN 'light_fighter' THEN",
    "                -- [WAR MACHINE] Ligeros reducidos, capital ships masivos",
    "                IF v_planet_role = 'military' THEN",
    "                  IF v_existing_ship_count >= 120 THEN",
    "                    v_ship_qty := 0;",
    "                  ELSE",
    "                    v_ship_qty := LEAST(2, 120 - v_existing_ship_count);",
    "                  END IF;",
    "                ELSE",
    "                  v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 250.0)::int));",
    "                END IF;",
  ].join(NL);

  const newLight = [
    "WHEN 'light_fighter' THEN",
    "                -- [WAR MACHINE v5] Si hay capital ships (shipyard>=7=battleship), STOP construir ligeros.",
    "                -- Si solo hay crucero (shipyard 5-6), cap pequeño. Sin capital ships, defensa básica.",
    "                IF v_planet_role = 'military' THEN",
    "                  IF v_shipyard_level >= 7 THEN",
    "                    v_ship_qty := 0;",
    "                  ELSIF v_shipyard_level >= 5 THEN",
    "                    IF v_existing_ship_count >= 50 THEN v_ship_qty := 0;",
    "                    ELSE v_ship_qty := LEAST(2, 50 - v_existing_ship_count); END IF;",
    "                  ELSE",
    "                    IF v_existing_ship_count >= 120 THEN v_ship_qty := 0;",
    "                    ELSE v_ship_qty := LEAST(5, 120 - v_existing_ship_count); END IF;",
    "                  END IF;",
    "                ELSE",
    "                  v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 250.0)::int));",
    "                END IF;",
  ].join(NL);

  if (!has(oldLight)) {
    console.error('❌ light_fighter military anchor not found (line endings?)');
    process.exit(1);
  }
  src = src.replace(oldLight, newLight);
  console.log('✅ light_fighter military: gating por shipyard level');

  // -----------------------------------------------------------------------
  // 2. heavy_fighter military branch
  // -----------------------------------------------------------------------
  const oldHeavy = [
    "WHEN 'heavy_fighter' THEN",
    "                IF v_planet_role = 'military' THEN",
    "                  v_ship_qty := GREATEST(3, LEAST(12, FLOOR(v_bot_points / 350.0)::int));",
    "                ELSE",
    "                  v_ship_qty := GREATEST(1, LEAST(16, FLOOR(v_bot_points / 220.0)::int));",
    "                END IF;",
  ].join(NL);

  const newHeavy = [
    "WHEN 'heavy_fighter' THEN",
    "                -- [WAR MACHINE v5] Heavy fighter caps según naves capital desbloqueadas:",
    "                -- shipyard>=9 (destroyer): cap 50  | >=8 (bomber/BC): cap 100 | >=7 (BS): cap 200",
    "                IF v_planet_role = 'military' THEN",
    "                  IF v_shipyard_level >= 9 THEN",
    "                    IF v_existing_ship_count >= 50 THEN v_ship_qty := 0;",
    "                    ELSE v_ship_qty := LEAST(2, 50 - v_existing_ship_count); END IF;",
    "                  ELSIF v_shipyard_level >= 8 THEN",
    "                    IF v_existing_ship_count >= 100 THEN v_ship_qty := 0;",
    "                    ELSE v_ship_qty := LEAST(3, 100 - v_existing_ship_count); END IF;",
    "                  ELSIF v_shipyard_level >= 7 THEN",
    "                    IF v_existing_ship_count >= 200 THEN v_ship_qty := 0;",
    "                    ELSE v_ship_qty := LEAST(4, 200 - v_existing_ship_count); END IF;",
    "                  ELSE",
    "                    v_ship_qty := GREATEST(3, LEAST(12, FLOOR(v_bot_points / 350.0)::int));",
    "                  END IF;",
    "                ELSE",
    "                  v_ship_qty := GREATEST(1, LEAST(16, FLOOR(v_bot_points / 220.0)::int));",
    "                END IF;",
  ].join(NL);

  if (!has(oldHeavy)) {
    console.error('❌ heavy_fighter military anchor not found');
    process.exit(1);
  }
  src = src.replace(oldHeavy, newHeavy);
  console.log('✅ heavy_fighter military: gating por shipyard level');

  // -----------------------------------------------------------------------
  // 3. Reduce v_max_ship_types_per_tick for military to 4-5 (was 6-7)
  //    so it doesn't queue light/heavy as filler when capitals are unaffordable.
  //    Cleaner: AI tries top capital ships, if none affordable -> wait next tick.
  // -----------------------------------------------------------------------
  const oldMaxTypes = [
    "IF v_planet_role = 'military' THEN",
    "            -- [WAR MACHINE] Producción agresiva: 6-7 tipos por tick",
    "            v_max_ship_types_per_tick := CASE",
    "              WHEN random() < 0.40 THEN 6",
    "              ELSE 7",
    "            END;",
  ].join(NL);

  const newMaxTypes = [
    "IF v_planet_role = 'military' THEN",
    "            -- [WAR MACHINE v5] 4-5 tipos por tick. Foco en naves duras: si no hay recursos para",
    "            -- destroyer/bomber/BS, mejor esperar al siguiente tick que rellenar con cazas.",
    "            v_max_ship_types_per_tick := CASE",
    "              WHEN random() < 0.50 THEN 4",
    "              ELSE 5",
    "            END;",
  ].join(NL);

  if (!has(oldMaxTypes)) {
    console.error('❌ v_max_ship_types_per_tick military anchor not found');
    process.exit(1);
  }
  src = src.replace(oldMaxTypes, newMaxTypes);
  console.log('✅ v_max_ship_types_per_tick military: 4-5 (antes 6-7)');

  // -----------------------------------------------------------------------
  // Recreate the function preserving signature.
  // -----------------------------------------------------------------------
  const sigRes = await c.query(`SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, l.lanname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  const { args, ret, lanname } = sigRes.rows[0];
  const sql = `CREATE OR REPLACE FUNCTION public.bot_ai_tick(${args}) RETURNS ${ret} LANGUAGE ${lanname} AS $BOTAITICK$\n${src}\n$BOTAITICK$;`;
  fs.writeFileSync('supabase/migrations/20260425_military_capital_focus.sql', sql);
  console.log('Wrote migration, size:', sql.length);

  try {
    await c.query(sql);
    console.log('✅ bot_ai_tick updated -> WAR MACHINE v5 (capital focus)');
  } catch (e) {
    console.error('❌ Error applying:', e.message);
    process.exit(1);
  }

  await c.end();
})();
