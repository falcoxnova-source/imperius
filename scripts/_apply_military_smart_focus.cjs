const { Client } = require('pg');
const fs = require('fs');

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

  // Get current function source
  const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'bot_ai_tick'`);
  let src = r.rows[0].def.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // ====== PATCH 1: Update military ship priority to include capitals ======
  const oldShipPriority = `v_ship_priority := ARRAY[
              'destroyer',
              'bomber',
              'battlecruiser',
              'battleship',
              'cruiser',
              'heavy_fighter',
              'light_fighter',
              'large_cargo',
              'small_cargo',
              'recycler',
              'espionage_probe',
              'colony_ship'
            ];`;
  const newShipPriority = `v_ship_priority := ARRAY[
              'deathstar',
              'falco_x',
              'nova',
              'destroyer',
              'bomber',
              'battlecruiser',
              'battleship',
              'cruiser',
              'heavy_fighter',
              'light_fighter',
              'large_cargo',
              'small_cargo',
              'recycler',
              'espionage_probe',
              'colony_ship'
            ];`;
  if (!src.includes(oldShipPriority)) throw new Error('ship priority block not found');
  src = src.replace(oldShipPriority, newShipPriority);

  // ====== PATCH 2: Replace ship quantity logic for military ======
  // We will replace the whole CASE block from 'WHEN cruiser' through end of 'destroyer'
  const oldQty = `              WHEN 'cruiser' THEN
                IF v_planet_role = 'military' THEN
                  v_ship_qty := GREATEST(4, LEAST(28, FLOOR(v_bot_points / 200.0)::int));
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(12, FLOOR(v_bot_points / 450.0)::int));
                END IF;
              WHEN 'battleship' THEN
                IF v_planet_role = 'military' THEN
                  v_ship_qty := GREATEST(5, LEAST(30, FLOOR(v_bot_points / 250.0)::int));
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 700.0)::int));
                END IF;
              WHEN 'bomber' THEN
                IF v_planet_role = 'military' THEN
                  v_ship_qty := GREATEST(4, LEAST(24, FLOOR(v_bot_points / 300.0)::int));
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(6, FLOOR(v_bot_points / 1100.0)::int));
                END IF;
              WHEN 'battlecruiser' THEN
                IF v_planet_role = 'military' THEN
                  v_ship_qty := GREATEST(5, LEAST(32, FLOOR(v_bot_points / 250.0)::int));
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(8, FLOOR(v_bot_points / 900.0)::int));
                END IF;
              WHEN 'destroyer' THEN
                IF v_planet_role = 'military' THEN
                  v_ship_qty := GREATEST(5, LEAST(26, FLOOR(v_bot_points / 280.0)::int));
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(6, FLOOR(v_bot_points / 1200.0)::int));
                END IF;`;

  // Strategy: cap intermediate ships when higher-tier shipyard levels exist.
  // Also add deathstar/falco_x/nova handling.
  const newQty = `              WHEN 'cruiser' THEN
                IF v_planet_role = 'military' THEN
                  -- Si battleship+ disponible (shipyard>=7), cruiser cap fuerte
                  IF v_shipyard_level >= 9 THEN
                    v_ship_qty := 0;
                  ELSIF v_shipyard_level >= 7 THEN
                    v_ship_qty := GREATEST(0, LEAST(2, 30 - v_existing_ship_count));
                  ELSE
                    v_ship_qty := GREATEST(2, LEAST(8, FLOOR(v_bot_points / 300.0)::int));
                  END IF;
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(12, FLOOR(v_bot_points / 450.0)::int));
                END IF;
              WHEN 'battleship' THEN
                IF v_planet_role = 'military' THEN
                  -- Si destroyer disponible (shipyard>=9), cap battleship
                  IF v_shipyard_level >= 9 THEN
                    v_ship_qty := GREATEST(0, LEAST(2, 50 - v_existing_ship_count));
                  ELSE
                    v_ship_qty := GREATEST(3, LEAST(15, FLOOR(v_bot_points / 350.0)::int));
                  END IF;
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 700.0)::int));
                END IF;
              WHEN 'bomber' THEN
                IF v_planet_role = 'military' THEN
                  -- Bomber siempre util vs defensas, pero cap si destroyer disponible
                  IF v_shipyard_level >= 9 THEN
                    v_ship_qty := GREATEST(1, LEAST(4, FLOOR(v_bot_points / 400.0)::int));
                  ELSE
                    v_ship_qty := GREATEST(2, LEAST(10, FLOOR(v_bot_points / 400.0)::int));
                  END IF;
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(6, FLOOR(v_bot_points / 1100.0)::int));
                END IF;
              WHEN 'battlecruiser' THEN
                IF v_planet_role = 'military' THEN
                  -- Battlecruiser util pero cap si destroyer disponible
                  IF v_shipyard_level >= 9 THEN
                    v_ship_qty := GREATEST(1, LEAST(5, FLOOR(v_bot_points / 350.0)::int));
                  ELSE
                    v_ship_qty := GREATEST(3, LEAST(12, FLOOR(v_bot_points / 300.0)::int));
                  END IF;
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(8, FLOOR(v_bot_points / 900.0)::int));
                END IF;
              WHEN 'destroyer' THEN
                IF v_planet_role = 'military' THEN
                  -- Destroyer es la nave preferida hasta deathstar
                  v_ship_qty := GREATEST(3, LEAST(20, FLOOR(v_bot_points / 250.0)::int));
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(6, FLOOR(v_bot_points / 1200.0)::int));
                END IF;
              WHEN 'deathstar' THEN
                -- Deathstar: la nave mas poderosa, prioridad maxima militar
                IF v_planet_role = 'military' THEN
                  v_ship_qty := GREATEST(1, LEAST(3, FLOOR(v_bot_points / 1500.0)::int));
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(2, FLOOR(v_bot_points / 3000.0)::int));
                END IF;
              WHEN 'nova' THEN
                IF v_planet_role = 'military' THEN
                  v_ship_qty := GREATEST(1, LEAST(2, FLOOR(v_bot_points / 2000.0)::int));
                ELSE
                  v_ship_qty := 1;
                END IF;
              WHEN 'falco_x' THEN
                IF v_planet_role = 'military' THEN
                  v_ship_qty := GREATEST(1, LEAST(2, FLOOR(v_bot_points / 1800.0)::int));
                ELSE
                  v_ship_qty := 1;
                END IF;`;

  if (!src.includes(oldQty)) throw new Error('ship qty block not found');
  src = src.replace(oldQty, newQty);

  // ====== PATCH 3: Improve heavy/light fighter caps when capital ships available ======
  // light_fighter: cap to 0 once shipyard>=9 (destroyer) instead of 7
  const oldLF = `              WHEN 'light_fighter' THEN
                -- [WAR MACHINE v5] Si hay capital ships (shipyard>=7=battleship), STOP construir ligeros.
                -- Si solo hay crucero (shipyard 5-6), cap pequeño. Sin capital ships, defensa básica.
                IF v_planet_role = 'military' THEN
                  IF v_shipyard_level >= 7 THEN
                    v_ship_qty := 0;
                  ELSIF v_shipyard_level >= 5 THEN
                    IF v_existing_ship_count >= 50 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(2, 50 - v_existing_ship_count); END IF;
                  ELSE
                    IF v_existing_ship_count >= 120 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(5, 120 - v_existing_ship_count); END IF;
                  END IF;
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 250.0)::int));
                END IF;`;
  const newLF = `              WHEN 'light_fighter' THEN
                -- [SMART FOCUS] Cero light_fighters si battleship+ disponible. Solo defensa basica al inicio.
                IF v_planet_role = 'military' THEN
                  IF v_shipyard_level >= 7 THEN
                    v_ship_qty := 0;
                  ELSIF v_shipyard_level >= 5 THEN
                    IF v_existing_ship_count >= 30 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(2, 30 - v_existing_ship_count); END IF;
                  ELSE
                    IF v_existing_ship_count >= 60 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(4, 60 - v_existing_ship_count); END IF;
                  END IF;
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 250.0)::int));
                END IF;`;
  if (!src.includes(oldLF)) throw new Error('light_fighter block not found');
  src = src.replace(oldLF, newLF);

  const oldHF = `              WHEN 'heavy_fighter' THEN
                -- [WAR MACHINE v5] Heavy fighter caps según naves capital desbloqueadas:
                -- shipyard>=9 (destroyer): cap 50  | >=8 (bomber/BC): cap 100 | >=7 (BS): cap 200
                IF v_planet_role = 'military' THEN
                  IF v_shipyard_level >= 9 THEN
                    IF v_existing_ship_count >= 50 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(2, 50 - v_existing_ship_count); END IF;
                  ELSIF v_shipyard_level >= 8 THEN
                    IF v_existing_ship_count >= 100 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(3, 100 - v_existing_ship_count); END IF;
                  ELSIF v_shipyard_level >= 7 THEN
                    IF v_existing_ship_count >= 200 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(4, 200 - v_existing_ship_count); END IF;
                  ELSE
                    v_ship_qty := GREATEST(3, LEAST(12, FLOOR(v_bot_points / 350.0)::int));
                  END IF;
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(16, FLOOR(v_bot_points / 220.0)::int));
                END IF;`;
  const newHF = `              WHEN 'heavy_fighter' THEN
                -- [SMART FOCUS] Heavy fighter caps mas estrictos para priorizar capitales
                IF v_planet_role = 'military' THEN
                  IF v_shipyard_level >= 9 THEN
                    IF v_existing_ship_count >= 30 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(2, 30 - v_existing_ship_count); END IF;
                  ELSIF v_shipyard_level >= 8 THEN
                    IF v_existing_ship_count >= 60 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(3, 60 - v_existing_ship_count); END IF;
                  ELSIF v_shipyard_level >= 7 THEN
                    IF v_existing_ship_count >= 100 THEN v_ship_qty := 0;
                    ELSE v_ship_qty := LEAST(3, 100 - v_existing_ship_count); END IF;
                  ELSE
                    v_ship_qty := GREATEST(2, LEAST(8, FLOOR(v_bot_points / 350.0)::int));
                  END IF;
                ELSE
                  v_ship_qty := GREATEST(1, LEAST(16, FLOOR(v_bot_points / 220.0)::int));
                END IF;`;
  if (!src.includes(oldHF)) throw new Error('heavy_fighter block not found');
  src = src.replace(oldHF, newHF);

  // ====== PATCH 4: Defense quantity rebalanced (bigger powerful, smaller cheap) + caps ======
  const oldDef = `            -- Cantidad según potencia
            CASE v_def.code
              WHEN 'plasma_turret' THEN v_def_qty := 4;
              WHEN 'gauss_cannon' THEN v_def_qty := 3;
              WHEN 'ion_cannon' THEN v_def_qty := 2;
              WHEN 'heavy_laser' THEN v_def_qty := 2;
              WHEN 'light_laser' THEN v_def_qty := 1;
              WHEN 'rocket_launcher' THEN v_def_qty := 1;
              WHEN 'small_shield_dome' THEN v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              WHEN 'large_shield_dome' THEN v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              ELSE v_def_qty := 1;
            END CASE;`;

  // Caps ensure small defenses don't accumulate excessively, larger ones can grow.
  const newDef = `            -- [SMART DEFENSE] Mix equilibrado: caps por tipo evitan acumular pequenas
            -- y favorecen las grandes. Mas cantidad por tick a las potentes.
            CASE v_def.code
              WHEN 'plasma_turret' THEN
                v_def_qty := GREATEST(0, LEAST(6, 80 - v_existing_def_count));
              WHEN 'gauss_cannon' THEN
                v_def_qty := GREATEST(0, LEAST(5, 60 - v_existing_def_count));
              WHEN 'ion_cannon' THEN
                v_def_qty := GREATEST(0, LEAST(3, 40 - v_existing_def_count));
              WHEN 'heavy_laser' THEN
                v_def_qty := GREATEST(0, LEAST(2, 30 - v_existing_def_count));
              WHEN 'light_laser' THEN
                -- Cap pequeno en light: solo se construye al inicio
                v_def_qty := GREATEST(0, LEAST(2, 25 - v_existing_def_count));
              WHEN 'rocket_launcher' THEN
                -- Cap pequeno en rocket: defensa basica nada mas
                v_def_qty := GREATEST(0, LEAST(2, 20 - v_existing_def_count));
              WHEN 'small_shield_dome' THEN v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              WHEN 'large_shield_dome' THEN v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              ELSE v_def_qty := 1;
            END CASE;`;

  if (!src.includes(oldDef)) throw new Error('defense qty block not found');
  src = src.replace(oldDef, newDef);

  // Save final SQL to a migration file
  const ts = '20260618360000';
  const migPath = `supabase/migrations/${ts}_military_smart_focus.sql`;
  const header = `/*
  # Military Autopilot Smart Focus

  Improves bot military strategy:
  1. Ships: priority includes deathstar/nova/falco_x at top. Strict caps on
     intermediate ships (cruiser/battleship/battlecruiser/heavy_fighter)
     when destroyers (shipyard>=9) are available.
  2. Defenses: caps on small defenses (rocket, light laser) to prevent
     accumulation, larger build quantities for plasma/gauss/ion turrets.

  ## Changes
  - bot_ai_tick(): military ship priority array updated, ship qty logic rebalanced,
    defense qty caps added per defense type.

  ## Notes
  - Drop-in replacement of bot_ai_tick().
*/

`;
  fs.writeFileSync(migPath, header + src + ';\n');
  console.log('Migration written:', migPath);

  // Apply now
  await c.query(src);
  console.log('Function updated in DB.');

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
