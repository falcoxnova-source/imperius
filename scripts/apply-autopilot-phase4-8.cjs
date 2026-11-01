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
  if (!pattern.test(source)) throw new Error(`No se encontró el patrón esperado: ${label}`);
  return source.replace(pattern, replacement);
}

function replaceOrThrow(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`No se encontró el bloque esperado: ${label}`);
  return source.replace(search, replacement);
}

async function main() {
  await client.connect();
  console.log('🚀 Aplicando Fases 4-8...');

  const migrationSql = fs.readFileSync('supabase/migrations/20260417180000_autopilot_phase7_phase8.sql', 'utf8');
  await client.query(migrationSql);
  console.log('✅ Migración Fase 7/8 aplicada');

  const fn = await client.query(`
    SELECT p.prosrc, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick' AND n.nspname = 'public'
    LIMIT 1
  `);
  if (!fn.rows.length) throw new Error('No se encontró public.bot_ai_tick');

  let src = fn.rows[0].prosrc;

  src = replaceOrThrow(
    src,
    "WHERE (is_bot = true OR (autopilot_active = true AND has_autopilot_access(id) AND (last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))",
    "WHERE (is_bot = true OR (autopilot_active = true AND has_autopilot_access(id) AND (autopilot_vip_boost = true OR last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))",
    'cursor profiles con vip boost'
  );

  src = replaceRegexOrThrow(
    src,
    /v_research_priority := ARRAY\[[\s\S]*?\];/,
    `IF v_planet_role = 'research' THEN
          v_research_priority := ARRAY[
            'energy_tech',
            'computer_tech',
            'espionage_tech',
            'laser_tech',
            'ion_tech',
            'hyperspace_tech',
            'plasma_tech',
            'shielding_tech',
            'armour_tech',
            'weapons_tech',
            'combustion_drive',
            'impulse_drive',
            'hyperspace_drive',
            'astrophysics'
          ];
        ELSIF v_planet_role = 'colonizer' THEN
          v_research_priority := ARRAY[
            'combustion_drive',
            'impulse_drive',
            'astrophysics',
            'computer_tech',
            'energy_tech',
            'espionage_tech',
            'shielding_tech',
            'armour_tech',
            'weapons_tech',
            'hyperspace_drive',
            'hyperspace_tech',
            'ion_tech',
            'laser_tech',
            'plasma_tech'
          ];
        ELSIF v_planet_role = 'military' THEN
          v_research_priority := ARRAY[
            'weapons_tech',
            'shielding_tech',
            'armour_tech',
            'laser_tech',
            'ion_tech',
            'hyperspace_drive',
            'impulse_drive',
            'computer_tech',
            'espionage_tech',
            'energy_tech',
            'hyperspace_tech',
            'plasma_tech',
            'combustion_drive',
            'astrophysics'
          ];
        ELSE
          v_research_priority := ARRAY[
            'energy_tech',
            'combustion_drive',
            'armour_tech',
            'shielding_tech',
            'impulse_drive',
            'espionage_tech',
            'ion_tech',
            'laser_tech',
            'weapons_tech',
            'hyperspace_drive',
            'computer_tech',
            'astrophysics',
            'hyperspace_tech',
            'plasma_tech'
          ];
        END IF;`,
    'research priority role-aware'
  );

  src = replaceOrThrow(
    src,
    "IF NOT v_fleet_action_taken AND v_origin_active_fleets = 0 AND v_phase_rand < 0.5 THEN",
    "IF v_planet_role = 'military' AND NOT v_fleet_action_taken AND v_origin_active_fleets = 0 AND v_phase_rand < 0.5 THEN",
    'fase F solo military'
  );

  src = replaceOrThrow(
    src,
    "IF NOT v_fleet_action_taken AND v_origin_active_fleets = 0 THEN",
    "IF v_planet_role = 'military' AND NOT v_fleet_action_taken AND v_origin_active_fleets = 0 THEN",
    'fase G solo military'
  );

  src = replaceRegexOrThrow(
    src,
    /CASE v_def\.code[\s\S]*?END CASE;/,
    `CASE v_def.code
              WHEN 'rocket_launcher' THEN v_def_qty := GREATEST(2, LEAST(CASE WHEN v_planet_role = 'miner' THEN 12 ELSE 50 END, FLOOR(v_bot_points / 100.0)::int));
              WHEN 'light_laser' THEN v_def_qty := GREATEST(2, LEAST(CASE WHEN v_planet_role = 'miner' THEN 10 ELSE 40 END, FLOOR(v_bot_points / 150.0)::int));
              WHEN 'heavy_laser' THEN v_def_qty := GREATEST(1, LEAST(CASE WHEN v_planet_role = 'miner' THEN 6 ELSE 25 END, FLOOR(v_bot_points / 300.0)::int));
              WHEN 'gauss_cannon' THEN v_def_qty := GREATEST(1, LEAST(CASE WHEN v_planet_role = 'miner' THEN 2 ELSE 15 END, FLOOR(v_bot_points / 500.0)::int));
              WHEN 'ion_cannon' THEN v_def_qty := GREATEST(1, LEAST(CASE WHEN v_planet_role = 'miner' THEN 2 ELSE 15 END, FLOOR(v_bot_points / 500.0)::int));
              WHEN 'plasma_turret' THEN v_def_qty := GREATEST(1, LEAST(CASE WHEN v_planet_role = 'miner' THEN 1 ELSE 10 END, FLOOR(v_bot_points / 800.0)::int));
              WHEN 'small_shield_dome' THEN v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              WHEN 'large_shield_dome' THEN v_def_qty := GREATEST(0, 1 - v_existing_def_count);
              ELSE v_def_qty := 1;
            END CASE;`,
    'tope defense miner'
  );

  src = replaceOrThrow(
    src,
    "IF NOT v_fleet_action_taken AND v_origin_active_fleets = 0 AND v_colony_ship_type_id IS NOT NULL THEN",
    `IF (
           v_planet_role = 'colonizer'
           OR (
             v_planet_role = 'balanced'
             AND NOT EXISTS (
               SELECT 1 FROM planets p_col
               WHERE p_col.user_id = v_bot.id
                 AND p_col.planet_type = 'planet'
                 AND NOT p_col.is_destroyed
                 AND COALESCE(p_col.autopilot_role, 'balanced') = 'colonizer'
             )
           )
         )
         AND NOT v_fleet_action_taken AND v_origin_active_fleets = 0 AND v_colony_ship_type_id IS NOT NULL THEN`,
    'fase K colonizer-only con fallback balanced'
  );

  src = replaceRegexOrThrow(
    src,
    /IF COALESCE\(\(v_fleet_result->>'success'\)::boolean, false\) THEN\s+v_fleets_sent := v_fleets_sent \+ 1;\s+v_transports_sent := v_transports_sent \+ 1;\s+v_transport_done := true;\s+END IF;/,
    `IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                  v_fleets_sent := v_fleets_sent + 1;
                  v_transports_sent := v_transports_sent + 1;
                  PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'transport_sent', jsonb_build_object('target_planet_id', v_other_planet.id, 'role', v_planet_role, 'metal', v_send_metal, 'crystal', v_send_crystal, 'deuterium', v_send_deut));
                  v_transport_done := true;
                END IF;`,
    'log transport'
  );

  src = replaceRegexOrThrow(
    src,
    /v_research_started := v_research_started \+ 1;\s+SELECT \* INTO v_resources FROM planet_resources WHERE planet_id = v_planet\.id;\s+EXIT;/,
    `v_research_started := v_research_started + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'research_started', jsonb_build_object('technology', v_tech.code, 'next_level', v_tech_current_level + 1, 'role', v_planet_role));
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              EXIT;`,
    'log research'
  );

  src = replaceRegexOrThrow(
    src,
    /v_ships_queued := v_ships_queued \+ 1;\s+SELECT \* INTO v_resources FROM planet_resources WHERE planet_id = v_planet\.id;\s+v_ship_types_queued_this_tick := v_ship_types_queued_this_tick \+ 1;/,
    `v_ships_queued := v_ships_queued + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'ships_queued', jsonb_build_object('ship', v_ship.code, 'quantity', v_ship_qty, 'role', v_planet_role));
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              v_ship_types_queued_this_tick := v_ship_types_queued_this_tick + 1;`,
    'log ships'
  );

  src = replaceRegexOrThrow(
    src,
    /v_defenses_queued := v_defenses_queued \+ 1;\s+SELECT \* INTO v_resources FROM planet_resources WHERE planet_id = v_planet\.id;\s+EXIT;/,
    `v_defenses_queued := v_defenses_queued + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'defenses_queued', jsonb_build_object('defense', v_def.code, 'quantity', v_def_qty, 'role', v_planet_role));
              SELECT * INTO v_resources FROM planet_resources WHERE planet_id = v_planet.id;
              EXIT;`,
    'log defenses'
  );

  src = replaceRegexOrThrow(
    src,
    /IF COALESCE\(\(v_fleet_result->>'success'\)::boolean, false\) THEN\s+v_fleets_sent := v_fleets_sent \+ 1;\s+v_colonizations_sent := v_colonizations_sent \+ 1;\s+v_fleet_action_taken := true;\s+EXIT;\s+END IF;/,
    `IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
              v_fleets_sent := v_fleets_sent + 1;
              v_colonizations_sent := v_colonizations_sent + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'colonization_sent', jsonb_build_object('target_position', v_colonize_target.position, 'galaxy', v_planet.galaxy, 'solar_system', v_planet.solar_system, 'role', v_planet_role));
              v_fleet_action_taken := true;
              EXIT;
            END IF;`,
    'log colonization'
  );

  src = replaceRegexOrThrow(
    src,
    /IF COALESCE\(\(v_fleet_result->>'success'\)::boolean, false\) THEN\s+v_fleets_sent := v_fleets_sent \+ 1;\s+v_retaliations_sent := v_retaliations_sent \+ 1;\s+v_fleet_action_taken := true;\s+v_retaliation_done := true;\s+EXIT;\s+END IF;/,
    `IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                  v_fleets_sent := v_fleets_sent + 1;
                  v_retaliations_sent := v_retaliations_sent + 1;
                  PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'retaliation_sent', jsonb_build_object('role', v_planet_role));
                  v_fleet_action_taken := true;
                  v_retaliation_done := true;
                  EXIT;
                END IF;`,
    'log retaliation'
  );

  src = replaceRegexOrThrow(
    src,
    /IF COALESCE\(\(v_fleet_result->>'success'\)::boolean, false\) THEN\s+v_fleets_sent := v_fleets_sent \+ 1;\s+v_fleet_action_taken := true;\s+EXIT;\s+END IF;/,
    `IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
              v_fleets_sent := v_fleets_sent + 1;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'attack_sent', jsonb_build_object('mission', 'attack', 'role', v_planet_role));
              v_fleet_action_taken := true;
              EXIT;
            END IF;`,
    'log attack'
  );

  await client.query(`
    CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
    RETURNS ${fn.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC$
${src}
$FUNC$;
  `);
  console.log('✅ bot_ai_tick actualizado Fases 4-8');

  const verify = await client.query(`
    SELECT
      POSITION('autopilot_vip_boost = true' IN p.prosrc) > 0 AS has_vip_boost,
      POSITION('v_planet_role = ''research''' IN p.prosrc) > 0 AS has_role_research,
      POSITION('v_planet_role = ''colonizer''' IN p.prosrc) > 0 AS has_role_colonizer,
      POSITION('v_planet_role = ''military'' AND NOT v_fleet_action_taken' IN p.prosrc) > 0 AS military_only_combat,
      POSITION('log_autopilot_event' IN p.prosrc) > 0 AS has_event_logs,
      EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_autopilot_events') AS has_events_rpc,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='autopilot_vip_boost') AS has_vip_column
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick' AND n.nspname = 'public'
    LIMIT 1
  `);

  console.log('🔎 Verificación:', verify.rows[0]);
  await client.end();
  console.log('🎉 Fases 4-8 listas en backend');
}

main().catch(async (error) => {
  console.error('❌', error.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
