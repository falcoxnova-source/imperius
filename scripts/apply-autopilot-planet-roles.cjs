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

function replaceOrThrow(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`No se encontró el bloque esperado: ${label}`);
  }
  return source.replace(search, replacement);
}

function replaceRegexOrThrow(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`No se encontró el patrón esperado: ${label}`);
  }
  return source.replace(pattern, replacement);
}

async function main() {
  await client.connect();
  console.log('🤖 Aplicando roles de autopiloto por planeta...');

  const migrationSql = fs.readFileSync('supabase/migrations/20260417160000_autopilot_planet_roles.sql', 'utf8');
  await client.query(migrationSql);
  console.log('✅ Columna autopilot_role + RPC set_planet_autopilot_role aplicados');

  const fn = await client.query(`
    SELECT
      p.oid,
      p.prosrc,
      pg_get_function_identity_arguments(p.oid) AS args,
      pg_get_function_result(p.oid) AS result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick'
      AND n.nspname = 'public'
    LIMIT 1
  `);

  if (fn.rows.length === 0) {
    throw new Error('No se encontró public.bot_ai_tick');
  }

  let src = fn.rows[0].prosrc;

  src = replaceOrThrow(
    src,
    "  v_spy_fleet_de integer := 0;",
    "  v_spy_fleet_de integer := 0;\n  v_planet_role text := 'balanced';",
    'declaración de v_planet_role'
  );

  src = replaceRegexOrThrow(
    src,
    /SELECT p\.id, p\.fields_used, p\.fields_max, p\.user_id, p\.galaxy, p\.solar_system, p\.position\s+FROM planets p/,
    `SELECT p.id, p.fields_used, p.fields_max, p.user_id, p.galaxy, p.solar_system, p.position, p.autopilot_role
      FROM planets p`,
    'select de planetas'
  );

  src = replaceRegexOrThrow(
    src,
    /SELECT \* INTO v_resources FROM planet_resources WHERE planet_id = v_planet\.id;\s+IF NOT FOUND THEN CONTINUE; END IF;/,
    `SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
      IF NOT FOUND THEN CONTINUE; END IF;

      v_planet_role := COALESCE(v_planet.autopilot_role, 'balanced');`,
    'lectura de role por planeta'
  );

  const oldBuildings = `            v_building_wish_list := ARRAY[]::text[];\n            IF v_metal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;\n            IF v_crystal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;\n            IF v_solar_plant_lvl < v_metal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;\n            IF v_crystal_mine_lvl < v_metal_mine_lvl - 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;\n            IF v_solar_plant_lvl < v_crystal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;\n            IF v_deut_synth_lvl < v_crystal_mine_lvl - 3 AND v_crystal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;\n            IF v_solar_plant_lvl <= v_deut_synth_lvl AND v_deut_synth_lvl > 0 THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;\n            IF v_robotics_lvl < 2 AND v_metal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;\n            IF v_shipyard_lvl < 1 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;\n            IF v_lab_lvl < 1 AND v_metal_mine_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;\n            IF v_robotics_lvl < 5 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;\n            IF v_shipyard_lvl < 4 AND v_robotics_lvl >= 3 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;\n            IF v_lab_lvl < 4 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;\n            IF v_metal_storage_lvl < 3 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;\n            IF v_crystal_storage_lvl < 3 AND v_crystal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;\n            IF v_deut_tank_lvl < 2 AND v_deut_synth_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;\n            IF v_robotics_lvl < 10 AND v_metal_mine_lvl >= 15 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;\n            IF v_shipyard_lvl < 12 AND v_robotics_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;\n            IF v_lab_lvl < 12 AND v_metal_mine_lvl >= 12 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;\n            IF v_metal_storage_lvl < 6 AND v_metal_mine_lvl >= 15 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;\n            IF v_crystal_storage_lvl < 6 AND v_crystal_mine_lvl >= 13 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;\n            IF v_deut_tank_lvl < 5 AND v_deut_synth_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;\n            v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');\n            v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');\n            v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');\n            v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');\n`;

  const newBuildings = `            v_building_wish_list := ARRAY[]::text[];\n            IF v_planet_role = 'miner' THEN\n              IF v_metal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;\n              IF v_crystal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;\n              IF v_solar_plant_lvl < v_metal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;\n              IF v_crystal_mine_lvl < v_metal_mine_lvl - 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;\n              IF v_deut_synth_lvl < v_crystal_mine_lvl - 2 AND v_crystal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;\n              IF v_solar_plant_lvl <= v_deut_synth_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;\n              IF v_robotics_lvl < 4 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;\n              IF v_shipyard_lvl < 2 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;\n              IF v_metal_storage_lvl < 4 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;\n              IF v_crystal_storage_lvl < 4 AND v_crystal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;\n              IF v_deut_tank_lvl < 3 AND v_deut_synth_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;\n              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');\n              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');\n              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');\n              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');\n            ELSIF v_planet_role = 'military' THEN\n              IF v_metal_mine_lvl < 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;\n              IF v_crystal_mine_lvl < 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;\n              IF v_deut_synth_lvl < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;\n              IF v_solar_plant_lvl < GREATEST(v_metal_mine_lvl - 1, v_crystal_mine_lvl) THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;\n              IF v_robotics_lvl < 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;\n              IF v_shipyard_lvl < 6 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;\n              IF v_metal_storage_lvl < 5 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;\n              IF v_crystal_storage_lvl < 5 AND v_crystal_mine_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;\n              IF v_deut_tank_lvl < 5 AND v_deut_synth_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;\n              IF v_robotics_lvl < 8 AND v_shipyard_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;\n              IF v_shipyard_lvl < 12 AND v_robotics_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;\n              IF v_lab_lvl < 2 AND v_metal_mine_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;\n              v_building_wish_list := array_append(v_building_wish_list, 'shipyard');\n              v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory');\n              v_building_wish_list := array_append(v_building_wish_list, 'metal_storage');\n              v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage');\n              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank');\n              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');\n              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');\n              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');\n              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');\n            ELSE\n              IF v_metal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_mine'); END IF;\n              IF v_crystal_mine_lvl < 1 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;\n              IF v_solar_plant_lvl < v_metal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;\n              IF v_crystal_mine_lvl < v_metal_mine_lvl - 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine'); END IF;\n              IF v_solar_plant_lvl < v_crystal_mine_lvl THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;\n              IF v_deut_synth_lvl < v_crystal_mine_lvl - 3 AND v_crystal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer'); END IF;\n              IF v_solar_plant_lvl <= v_deut_synth_lvl AND v_deut_synth_lvl > 0 THEN v_building_wish_list := array_append(v_building_wish_list, 'solar_plant'); END IF;\n              IF v_robotics_lvl < 2 AND v_metal_mine_lvl >= 4 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;\n              IF v_shipyard_lvl < 1 AND v_robotics_lvl >= 2 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;\n              IF v_lab_lvl < 1 AND v_metal_mine_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;\n              IF v_robotics_lvl < 5 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;\n              IF v_shipyard_lvl < 4 AND v_robotics_lvl >= 3 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;\n              IF v_lab_lvl < 4 AND v_metal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;\n              IF v_metal_storage_lvl < 3 AND v_metal_mine_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;\n              IF v_crystal_storage_lvl < 3 AND v_crystal_mine_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;\n              IF v_deut_tank_lvl < 2 AND v_deut_synth_lvl >= 6 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;\n              IF v_robotics_lvl < 10 AND v_metal_mine_lvl >= 15 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;\n              IF v_shipyard_lvl < 12 AND v_robotics_lvl >= 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;\n              IF v_lab_lvl < 12 AND v_metal_mine_lvl >= 12 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;\n              IF v_metal_storage_lvl < 6 AND v_metal_mine_lvl >= 15 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;\n              IF v_crystal_storage_lvl < 6 AND v_crystal_mine_lvl >= 13 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;\n              IF v_deut_tank_lvl < 5 AND v_deut_synth_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;\n              v_building_wish_list := array_append(v_building_wish_list, 'metal_mine');\n              v_building_wish_list := array_append(v_building_wish_list, 'crystal_mine');\n              v_building_wish_list := array_append(v_building_wish_list, 'deuterium_synthesizer');\n              v_building_wish_list := array_append(v_building_wish_list, 'solar_plant');\n            END IF;\n`;
  src = replaceRegexOrThrow(
    src,
    /v_building_wish_list := ARRAY\[\]::text\[\];[\s\S]*?(?=\n\s*-- \[AUTOPILOT\/BOT\] Si hay déficit de energía)/,
    newBuildings.trimEnd(),
    'wishlist de edificios'
  );

  const oldShips = `          -- Contador: cuántos tipos distintos encolar en este tick\n          -- 3-5 tipos para flotas robustas y variadas\n          v_ship_types_queued_this_tick := 0;\n          v_max_ship_types_per_tick := CASE\n            WHEN random() < 0.3 THEN 3\n            WHEN random() < 0.7 THEN 4\n            ELSE 5\n          END;\n          -- Flota estratégica aleatoria: cada tick elige un enfoque distinto\n          -- 1) Economía/soporte (transporte + reciclaje)\n          -- 2) Ataque pesado\n          -- 3) Balanceado\n          IF random() < 0.33 THEN\n            v_ship_priority := ARRAY[\n              'small_cargo',\n              'large_cargo',\n              'recycler',\n              'espionage_probe',\n              'colony_ship',\n              'cruiser',\n              'battleship',\n              'battlecruiser',\n              'destroyer',\n              'bomber',\n              'heavy_fighter',\n              'light_fighter'\n            ];\n          ELSIF random() < 0.66 THEN\n            v_ship_priority := ARRAY[\n              'cruiser',\n              'battleship',\n              'battlecruiser',\n              'destroyer',\n              'bomber',\n              'heavy_fighter',\n              'light_fighter',\n              'large_cargo',\n              'small_cargo',\n              'recycler',\n              'espionage_probe',\n              'colony_ship'\n            ];\n          ELSE\n            v_ship_priority := ARRAY[\n              'heavy_fighter',\n              'cruiser',\n              'battleship',\n              'battlecruiser',\n              'small_cargo',\n              'large_cargo',\n              'recycler',\n              'espionage_probe',\n              'colony_ship',\n              'destroyer',\n              'bomber',\n              'light_fighter'\n            ];\n          END IF;\n`;

  const newShips = `          -- Contador: cuántos tipos distintos encolar en este tick\n          v_ship_types_queued_this_tick := 0;\n          IF v_planet_role = 'military' THEN\n            v_max_ship_types_per_tick := CASE\n              WHEN random() < 0.45 THEN 4\n              ELSE 5\n            END;\n            v_ship_priority := ARRAY[\n              'light_fighter',\n              'heavy_fighter',\n              'cruiser',\n              'battleship',\n              'battlecruiser',\n              'destroyer',\n              'bomber',\n              'large_cargo',\n              'small_cargo',\n              'recycler',\n              'espionage_probe',\n              'colony_ship'\n            ];\n          ELSIF v_planet_role = 'miner' THEN\n            v_max_ship_types_per_tick := CASE\n              WHEN random() < 0.5 THEN 2\n              ELSE 3\n            END;\n            v_ship_priority := ARRAY[\n              'small_cargo',\n              'large_cargo',\n              'recycler',\n              'espionage_probe',\n              'light_fighter',\n              'heavy_fighter',\n              'cruiser',\n              'battleship',\n              'battlecruiser',\n              'destroyer',\n              'bomber',\n              'colony_ship'\n            ];\n          ELSE\n            v_max_ship_types_per_tick := CASE\n              WHEN random() < 0.3 THEN 3\n              WHEN random() < 0.7 THEN 4\n              ELSE 5\n            END;\n            IF random() < 0.33 THEN\n              v_ship_priority := ARRAY[\n                'small_cargo',\n                'large_cargo',\n                'recycler',\n                'espionage_probe',\n                'colony_ship',\n                'cruiser',\n                'battleship',\n                'battlecruiser',\n                'destroyer',\n                'bomber',\n                'heavy_fighter',\n                'light_fighter'\n              ];\n            ELSIF random() < 0.66 THEN\n              v_ship_priority := ARRAY[\n                'cruiser',\n                'battleship',\n                'battlecruiser',\n                'destroyer',\n                'bomber',\n                'heavy_fighter',\n                'light_fighter',\n                'large_cargo',\n                'small_cargo',\n                'recycler',\n                'espionage_probe',\n                'colony_ship'\n              ];\n            ELSE\n              v_ship_priority := ARRAY[\n                'heavy_fighter',\n                'cruiser',\n                'battleship',\n                'battlecruiser',\n                'small_cargo',\n                'large_cargo',\n                'recycler',\n                'espionage_probe',\n                'colony_ship',\n                'destroyer',\n                'bomber',\n                'light_fighter'\n              ];\n            END IF;\n          END IF;\n`;
  src = replaceRegexOrThrow(
    src,
    /-- Contador: cuántos tipos distintos encolar en este tick[\s\S]*?(?=\n\s*FOR i IN 1\.\.array_length\(v_ship_priority, 1\) LOOP)/,
    newShips.trimEnd(),
    'prioridad de flotas'
  );

  src = replaceOrThrow(
    src,
    `          v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'heavy_laser', 'gauss_cannon', 'ion_cannon', 'plasma_turret', 'small_shield_dome', 'large_shield_dome'];`,
    `          IF v_planet_role = 'military' THEN\n            v_defense_priority := ARRAY['gauss_cannon', 'plasma_turret', 'ion_cannon', 'heavy_laser', 'light_laser', 'rocket_launcher', 'small_shield_dome', 'large_shield_dome'];\n          ELSIF v_planet_role = 'miner' THEN\n            v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'heavy_laser', 'small_shield_dome', 'gauss_cannon', 'ion_cannon', 'large_shield_dome', 'plasma_turret'];\n          ELSE\n            v_defense_priority := ARRAY['rocket_launcher', 'light_laser', 'heavy_laser', 'gauss_cannon', 'ion_cannon', 'plasma_turret', 'small_shield_dome', 'large_shield_dome'];\n          END IF;`,
    'prioridad de defensas'
  );

  await client.query(`
    CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
    RETURNS ${fn.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC$
${src}
$FUNC$;
  `);
  console.log('✅ bot_ai_tick actualizado con roles balanced/miner/military');

  const verify = await client.query(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'planets'
          AND column_name = 'autopilot_role'
      ) AS has_column,
      EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname = 'set_planet_autopilot_role'
      ) AS has_rpc,
      POSITION('v_planet_role' IN p.prosrc) > 0 AS bot_has_roles
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick'
      AND n.nspname = 'public'
    LIMIT 1
  `);

  console.log('🔎 Verificación:', verify.rows[0]);
  console.log('🎉 Roles de autopiloto listos');
  await client.end();
}

main().catch(async (error) => {
  console.error('❌', error.message);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
