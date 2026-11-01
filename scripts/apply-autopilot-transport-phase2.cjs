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

// Nuevo bloque Phase H role-aware.
// Reglas:
//  - military => no envía (acumula para guerra)
//  - miner    => envía agresivo (umbrales bajos, sin filtrar por riqueza del destino),
//                prioriza destinos military > balanced, y nunca envía a otro minero
//  - balanced => comportamiento anterior (conservador, envía al "más pobre")
const NEW_PHASE_H = `      -- Phase H: Transport resources between own planets (role-aware, Phase 2)
      IF NOT v_fleet_action_taken
         AND v_origin_active_fleets = 0
         AND v_small_cargo_type_id IS NOT NULL
         AND v_planet_role <> 'military' THEN
        SELECT COALESCE(ps.quantity, 0) INTO v_small_cargo_count FROM planet_ships ps WHERE ps.planet_id = v_planet.id AND ps.ship_type_id = v_small_cargo_type_id;
        v_small_cargo_count := COALESCE(v_small_cargo_count, 0);
        IF (v_planet_role = 'miner'
              AND v_small_cargo_count >= 2
              AND (v_resources.metal > 15000 OR v_resources.crystal > 10000 OR v_resources.deuterium > 6000))
           OR (v_planet_role <> 'miner'
              AND v_small_cargo_count >= 3
              AND (v_resources.metal > 50000 OR v_resources.crystal > 50000 OR v_resources.deuterium > 30000))
        THEN
          v_transport_done := false;
          FOR v_other_planet IN
            SELECT op.id, op.galaxy, op.solar_system, op.position,
                   COALESCE(op.autopilot_role, 'balanced') AS role
            FROM planets op
            WHERE op.user_id = v_bot.id
              AND op.planet_type = 'planet'
              AND op.id <> v_planet.id
              AND NOT op.is_destroyed
              AND COALESCE(op.autopilot_role, 'balanced') <> 'miner'
              AND NOT EXISTS (
                SELECT 1 FROM fleets f
                WHERE f.user_id = v_bot.id
                  AND f.mission_type = 'transport'
                  AND f.target_galaxy = op.galaxy
                  AND f.target_system = op.solar_system
                  AND f.target_position = op.position
                  AND f.is_completed = false
              )
            ORDER BY
              CASE COALESCE(op.autopilot_role, 'balanced')
                WHEN 'military' THEN 0
                WHEN 'balanced' THEN 1
                ELSE 2
              END,
              ABS(op.galaxy - v_planet.galaxy) * 1000
                + ABS(op.solar_system - v_planet.solar_system)
            LIMIT 5
          LOOP
            IF v_transport_done THEN EXIT; END IF;
            SELECT * INTO v_other_resources FROM planet_resources WHERE planet_id = v_other_planet.id;
            IF NOT FOUND THEN CONTINUE; END IF;

            -- El minero envía siempre (para eso existe). Balanced sólo reequilibra hacia el más pobre.
            IF v_planet_role = 'miner'
               OR v_other_resources.metal < v_resources.metal * 0.4
               OR v_other_resources.crystal < v_resources.crystal * 0.4
            THEN
              v_cargo_capacity := (v_small_cargo_count - 1)::bigint * v_cargo_ship_capacity;

              IF v_planet_role = 'miner' THEN
                -- Dejar reserva mínima para seguir operando la colonia minera
                v_send_metal := LEAST(GREATEST(0, v_resources.metal - 5000), (v_cargo_capacity * 0.55)::bigint)::bigint;
                v_send_crystal := LEAST(GREATEST(0, v_resources.crystal - 4000), ((v_cargo_capacity - v_send_metal) * 0.7)::bigint)::bigint;
                v_send_deut := LEAST(GREATEST(0, v_resources.deuterium - 3000), (v_cargo_capacity - v_send_metal - v_send_crystal))::bigint;
              ELSE
                v_send_metal := LEAST(GREATEST(0, (v_resources.metal - 20000) / 2), v_cargo_capacity * 0.5)::bigint;
                v_send_crystal := LEAST(GREATEST(0, (v_resources.crystal - 15000) / 2), (v_cargo_capacity - v_send_metal) * 0.7)::bigint;
                v_send_deut := LEAST(GREATEST(0, (v_resources.deuterium - 10000) / 4), (v_cargo_capacity - v_send_metal - v_send_crystal))::bigint;
              END IF;

              IF (v_send_metal + v_send_crystal + v_send_deut) >= (CASE WHEN v_planet_role = 'miner' THEN 2000 ELSE 5000 END) THEN
                v_fleet_result := secure_send_fleet(
                  p_origin_planet_id := v_planet.id,
                  p_target_galaxy := v_other_planet.galaxy,
                  p_target_system := v_other_planet.solar_system,
                  p_target_position := v_other_planet.position,
                  p_mission_type := 'transport',
                  p_fleet_ships := jsonb_build_array(jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', v_small_cargo_count - 1)),
                  p_cargo_metal := v_send_metal,
                  p_cargo_crystal := v_send_crystal,
                  p_cargo_deuterium := v_send_deut,
                  p_speed_percent := 100,
                  p_target_type := 'planet',
                  p_override_user_id := v_bot.id
                );
                IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
                  v_fleets_sent := v_fleets_sent + 1;
                  v_transports_sent := v_transports_sent + 1;
                  v_transport_done := true;
                END IF;
              END IF;
            END IF;
          END LOOP;
        END IF;
      END IF;`;

async function main() {
  await client.connect();
  console.log('🚚 Aplicando Fase 2: transporte automático role-aware...');

  const fn = await client.query(`
    SELECT
      p.prosrc,
      pg_get_function_identity_arguments(p.oid) AS args,
      pg_get_function_result(p.oid) AS result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick' AND n.nspname = 'public'
    LIMIT 1
  `);
  if (fn.rows.length === 0) throw new Error('No se encontró public.bot_ai_tick');

  let src = fn.rows[0].prosrc;

  // Reemplazar todo el bloque Phase H hasta justo antes de Phase J
  src = replaceRegexOrThrow(
    src,
    /-- Phase H: Transport resources between own planets[\s\S]*?(?=\n\s*-- Phase J: Recycling)/,
    NEW_PHASE_H + '\n\n',
    'bloque Phase H (transporte)'
  );

  // Debug: escribir src completo a fichero
  require('fs').writeFileSync('scripts/_bot_ai_tick_after_phase2.sql', src);
  console.log('📏 src length:', src.length, '(escrito a scripts/_bot_ai_tick_after_phase2.sql)');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
    RETURNS ${fn.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC_FXU$
${src}
$FUNC_FXU$;
  `);
  console.log('✅ Phase H reescrita con lógica role-aware (miner envía, military acumula)');

  const verify = await client.query(`
    SELECT
      POSITION('role-aware, Phase 2' IN p.prosrc) > 0 AS has_phase2,
      POSITION($$v_planet_role <> 'military'$$ IN p.prosrc) > 0 AS military_skips,
      POSITION($$WHEN 'military' THEN 0$$ IN p.prosrc) > 0 AS prefers_military_targets
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick' AND n.nspname = 'public'
    LIMIT 1
  `);
  console.log('🔎 Verificación:', verify.rows[0]);
  console.log('🎉 Fase 2 lista');
  await client.end();
}

main().catch(async (error) => {
  console.error('❌', error.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
