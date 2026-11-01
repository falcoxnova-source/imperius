const fs = require('fs');
const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

function replaceRegexOrThrow(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`No se encontró el patrón esperado: ${label}`);
  }
  return source.replace(pattern, replacement);
}

function replaceOrThrow(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`No se encontró el bloque esperado: ${label}`);
  }
  return source.replace(search, replacement);
}

const NEW_BUILDINGS = `            v_building_wish_list := ARRAY[]::text[];
            IF v_planet_role = 'miner' THEN
              IF v_metal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_solar_plant_lvl < v_metal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_crystal_mine_lvl < v_metal_mine_lvl - 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_deut_synth_lvl < v_crystal_mine_lvl - 2 AND v_crystal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl <= v_deut_synth_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 4 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 2 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_metal_storage_lvl < 4 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 4 AND v_crystal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 3 AND v_deut_synth_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            ELSIF v_planet_role = 'military' THEN
              IF v_metal_mine_lvl < 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_deut_synth_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl < GREATEST(v_metal_mine_lvl - 1, v_crystal_mine_lvl) THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 6 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_metal_storage_lvl < 5 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 5 AND v_crystal_mine_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 5 AND v_deut_synth_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              IF v_robotics_lvl < 8 AND v_shipyard_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 12 AND v_robotics_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 2 AND v_metal_mine_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'shipyard');
              v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory');
              v_building_wish_list := array_append(v_building_wish_list, 'metal_storage');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank');
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            ELSIF v_planet_role = 'research' THEN
              IF v_lab_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_mine_lvl < 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_deut_synth_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl < GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl) THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_lab_lvl < 12 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_storage_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'research_lab');
              v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            ELSIF v_planet_role = 'colonizer' THEN
              IF v_metal_mine_lvl < 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 7 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_deut_synth_lvl < 7 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl < GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl, v_deut_synth_lvl - 1) THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 6 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_storage_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'shipyard');
              v_building_wish_list := array_append(v_building_wish_list, 'research_lab');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
            ELSE
              IF v_metal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;
              IF v_crystal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_solar_plant_lvl < v_metal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_crystal_mine_lvl < v_metal_mine_lvl - 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;
              IF v_solar_plant_lvl < v_crystal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_deut_synth_lvl < v_crystal_mine_lvl - 3 AND v_crystal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;
              IF v_solar_plant_lvl <= v_deut_synth_lvl AND v_deut_synth_lvl > 0 THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;
              IF v_robotics_lvl < 2 AND v_metal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 1 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 1 AND v_metal_mine_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_robotics_lvl < 5 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 4 AND v_robotics_lvl >= 3 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 4 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_storage_lvl < 3 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 3 AND v_crystal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 2 AND v_deut_synth_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              IF v_robotics_lvl < 10 AND v_metal_mine_lvl >= 15 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 12 AND v_robotics_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 12 AND v_metal_mine_lvl >= 12 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;
              IF v_metal_storage_lvl < 6 AND v_metal_mine_lvl >= 15 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < 6 AND v_crystal_mine_lvl >= 13 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < 5 AND v_deut_synth_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');
              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');
              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');
            END IF;`;

const NEW_SHIPS = `          -- Contador: cuántos tipos distintos encolar en este tick
          v_ship_types_queued_this_tick := 0;
          IF v_planet_role = 'military' THEN
            v_max_ship_types_per_tick := CASE
              WHEN random() < 0.45 THEN 4
              ELSE 5
            END;
            v_ship_priority := ARRAY[
              'light_fighter',
              'heavy_fighter',
              'cruiser',
              'battleship',
              'battlecruiser',
              'destroyer',
              'bomber',
              'large_cargo',
              'small_cargo',
              'recycler',
              'espionage_probe',
              'colony_ship'
            ];
          ELSIF v_planet_role = 'miner' THEN
            v_max_ship_types_per_tick := CASE
              WHEN random() < 0.5 THEN 2
              ELSE 3
            END;
            v_ship_priority := ARRAY[
              'small_cargo',
              'large_cargo',
              'recycler',
              'espionage_probe',
              'light_fighter',
              'heavy_fighter',
              'cruiser',
              'battleship',
              'battlecruiser',
              'destroyer',
              'bomber',
              'colony_ship'
            ];
          ELSIF v_planet_role = 'research' THEN
            v_max_ship_types_per_tick := CASE
              WHEN random() < 0.6 THEN 2
              ELSE 3
            END;
            v_ship_priority := ARRAY[
              'espionage_probe',
              'small_cargo',
              'recycler',
              'large_cargo',
              'light_fighter',
              'heavy_fighter',
              'cruiser',
              'battleship',
              'battlecruiser',
              'destroyer',
              'bomber',
              'colony_ship'
            ];
          ELSIF v_planet_role = 'colonizer' THEN
            v_max_ship_types_per_tick := CASE
              WHEN random() < 0.4 THEN 3
              ELSE 4
            END;
            v_ship_priority := ARRAY[
              'colony_ship',
              'small_cargo',
              'large_cargo',
              'recycler',
              'espionage_probe',
              'light_fighter',
              'heavy_fighter',
              'cruiser',
              'battleship',
              'battlecruiser',
              'destroyer',
              'bomber'
            ];
          ELSE
            v_max_ship_types_per_tick := CASE
              WHEN random() < 0.3 THEN 3
              WHEN random() < 0.7 THEN 4
              ELSE 5
            END;
            IF random() < 0.33 THEN
              v_ship_priority := ARRAY[
                'small_cargo',
                'large_cargo',
                'recycler',
                'espionage_probe',
                'colony_ship',
                'cruiser',
                'battleship',
                'battlecruiser',
                'destroyer',
                'bomber',
                'heavy_fighter',
                'light_fighter'
              ];
            ELSIF random() < 0.66 THEN
              v_ship_priority := ARRAY[
                'cruiser',
                'battleship',
                'battlecruiser',
                'destroyer',
                'bomber',
                'heavy_fighter',
                'light_fighter',
                'large_cargo',
                'small_cargo',
                'recycler',
                'espionage_probe',
                'colony_ship'
              ];
            ELSE
              v_ship_priority := ARRAY[
                'heavy_fighter',
                'cruiser',
                'battleship',
                'battlecruiser',
                'small_cargo',
                'large_cargo',
                'recycler',
                'espionage_probe',
                'colony_ship',
                'destroyer',
                'bomber',
                'light_fighter'
              ];
            END IF;
          END IF;`;

const NEW_DEFENSES = `          IF v_planet_role = 'military' THEN
            v_defense_priority := ARRAY['gauss_cannon', 'plasma_turret', 'ion_cannon', 'heavy_laser', 'light_laser', 'rocket_launcher', 'small_shield_dome', 'large_shield_dome'];
          ELSIF v_planet_role = 'miner' THEN
            v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'heavy_laser', 'small_shield_dome', 'gauss_cannon', 'ion_cannon', 'large_shield_dome', 'plasma_turret'];
          ELSIF v_planet_role = 'research' THEN
            v_defense_priority := ARRAY['light_laser', 'rocket_launcher', 'heavy_laser', 'small_shield_dome', 'ion_cannon', 'gauss_cannon', 'large_shield_dome', 'plasma_turret'];
          ELSIF v_planet_role = 'colonizer' THEN
            v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'small_shield_dome', 'heavy_laser', 'gauss_cannon', 'ion_cannon', 'large_shield_dome', 'plasma_turret'];
          ELSE
            v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'heavy_laser', 'gauss_cannon', 'ion_cannon', 'plasma_turret', 'small_shield_dome', 'large_shield_dome'];
          END IF;`;

async function main() {
  await client.connect();
  console.log('🧠 Aplicando Fase 3: roles research + colonizer...');

  const migrationSql = fs.readFileSync('supabase/migrations/20260417170000_autopilot_roles_phase3.sql', 'utf8');
  await client.query(migrationSql);
  console.log('✅ Migración Fase 3 aplicada');

  const fn = await client.query(`
    SELECT p.prosrc, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick' AND n.nspname = 'public'
    LIMIT 1
  `);
  if (fn.rows.length === 0) throw new Error('No se encontró public.bot_ai_tick');

  let src = fn.rows[0].prosrc;

  src = replaceRegexOrThrow(
    src,
    /v_building_wish_list := ARRAY\[\]::text\[\];[\s\S]*?(?=\n\s*-- \[AUTOPILOT\/BOT\] Si hay déficit de energía)/,
    NEW_BUILDINGS,
    'wishlist de edificios'
  );

  src = replaceRegexOrThrow(
    src,
    /-- Contador: cuántos tipos distintos encolar en este tick[\s\S]*?(?=\n\s*FOR i IN 1\.\.array_length\(v_ship_priority, 1\) LOOP)/,
    NEW_SHIPS,
    'prioridad de flotas'
  );

  src = replaceRegexOrThrow(
    src,
    /IF v_planet_role = 'military' THEN\s+v_defense_priority := ARRAY\['gauss_cannon'[\s\S]*?END IF;/,
    NEW_DEFENSES,
    'prioridad de defensas'
  );

  src = replaceOrThrow(
    src,
    "CASE COALESCE(op.autopilot_role, 'balanced')\n                WHEN 'military' THEN 0\n                WHEN 'balanced' THEN 1\n                ELSE 2\n              END",
    "CASE COALESCE(op.autopilot_role, 'balanced')\n                WHEN 'military' THEN 0\n                WHEN 'research' THEN 1\n                WHEN 'balanced' THEN 2\n                WHEN 'colonizer' THEN 3\n                ELSE 4\n              END",
    'orden de destinos transporte'
  );

  await client.query(`
    CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
    RETURNS ${fn.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC$
${src}
$FUNC$;
  `);
  console.log('✅ bot_ai_tick actualizado para roles research/colonizer');

  const verify = await client.query(`
    SELECT
      POSITION('v_planet_role = ''research''' IN p.prosrc) > 0 AS has_research_branch,
      POSITION('v_planet_role = ''colonizer''' IN p.prosrc) > 0 AS has_colonizer_branch,
      POSITION('WHEN ''research'' THEN 1' IN p.prosrc) > 0 AS transport_prioritizes_research,
      EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'planets'
          AND c.conname = 'planets_autopilot_role_check'
          AND pg_get_constraintdef(c.oid) ILIKE '%research%'
          AND pg_get_constraintdef(c.oid) ILIKE '%colonizer%'
      ) AS has_constraint_phase3
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick' AND n.nspname = 'public'
    LIMIT 1
  `);

  console.log('🔎 Verificación:', verify.rows[0]);
  console.log('🎉 Fase 3 lista');
  await client.end();
}

main().catch(async (error) => {
  console.error('❌', error.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
