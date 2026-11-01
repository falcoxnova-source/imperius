-- =====================================================================
-- FASE 14 — Autopiloto veterano: reserva economica + escalado sin techo
-- =====================================================================
-- DIAGNOSTICO (datos de produccion, 7 dias):
--   * 7.583 lotes de naves encolados  vs  80 edificios encolados  (ratio 95:1)
--   * Metal medio en planetas 'balanced' (88% del total): 2.664
--     Coste de subir robotica 4->5: 6.400 metal | mina metal 12->13: 7.784
--     => los bots NUNCA acumulan lo suficiente para subir un edificio.
--   * Resultado: minas ~10, robotica ~3.9, hangar ~3.8, laboratorio ~3.7,
--     nanite en 1 solo planeta del servidor, 0 acorazados/destructores reales,
--     ataques con 11,6 naves de media.
--
-- CAUSA RAIZ: la Fase C (naves) y la Fase D (defensas) gastan el 100% de los
-- recursos del planeta en cada tick (cada 5 min), antes de que la Fase A pueda
-- acumular el coste del siguiente edificio. La economia queda congelada.
--
-- SOLUCION (quirurgica, sin duplicar logica):
--   1. La Fase A fija una RESERVA ECONOMICA con el coste del siguiente edificio
--      prioritario (solo si cabe en los almacenes del planeta).
--   2. Las Fases C y D solo pueden gastar el EXCEDENTE por encima de esa reserva.
--   3. La reserva se escala por madurez: minas <16 ahorra el 100%,
--      16-21 el 50%, 22+ nada (economia de guerra).
--   4. El rol 'balanced' gana escalado sin techo (almacenes que siguen a las
--      minas, nanite, laboratorio y hangar altos) para no estancarse nunca.
--   5. Se registra el evento 'attack_sent' para poder auditar los ataques.
--
-- Metodo: pg_get_functiondef + replace() literal con asercion de unicidad.
-- Si CUALQUIER ancla no aparece exactamente 1 vez, aborta sin cambios.
-- =====================================================================

BEGIN;

DO $mig$
DECLARE
  v_oid  oid;
  v_def  text;
  v_a    text;
  v_b    text;
  v_hits integer;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bot_ai_tick' AND p.prokind = 'f';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'public.bot_ai_tick() no existe; abortado sin cambios';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF position('v_econ_reserve_metal' in v_def) > 0 THEN
    RAISE EXCEPTION 'La migracion FASE 14 ya estaba aplicada; abortado sin cambios';
  END IF;

  -- ------------------------------------------------------------------
  -- R1: declarar las variables de la reserva economica
  -- ------------------------------------------------------------------
  v_a := $a$  v_capital_ready boolean := false;$a$;
  v_b := $b$  v_capital_ready boolean := false;
  -- [VETERANO v14] Reserva economica: recursos apartados para el siguiente edificio
  -- del planeta. Las fases de naves y defensas NO pueden tocarlos. Sin esto los bots
  -- fundian el 100% de sus recursos en naves cada 5 minutos y su economia no avanzaba.
  v_econ_reserve_metal bigint := 0;
  v_econ_reserve_crystal bigint := 0;
  v_econ_reserve_deut bigint := 0;
  v_econ_reserve_factor numeric := 1.0;$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R1: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  -- ------------------------------------------------------------------
  -- R2: resetear la reserva al empezar cada planeta
  -- ------------------------------------------------------------------
  v_a := $a$      -- Phase A: Buildings$a$;
  v_b := $b$      -- [VETERANO v14] Reset de la reserva economica en cada planeta.
      v_econ_reserve_metal := 0;
      v_econ_reserve_crystal := 0;
      v_econ_reserve_deut := 0;
      v_econ_reserve_factor := 1.0;

      -- Phase A: Buildings$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R2: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  -- ------------------------------------------------------------------
  -- R3: la Fase A fija la reserva con el coste del edificio mas prioritario
  -- ------------------------------------------------------------------
  v_a := $a$              v_cost_deuterium := FLOOR(v_try_bt.base_deuterium * POWER(v_try_bt.cost_factor, v_current_level));$a$;
  v_b := $b$              v_cost_deuterium := FLOOR(v_try_bt.base_deuterium * POWER(v_try_bt.cost_factor, v_current_level));
              -- [VETERANO v14] Fijar la reserva economica en el PRIMER edificio pendiente de
              -- la wishlist (el mas prioritario) cuyo coste quepa en los almacenes del planeta.
              -- El cap de almacen es 10000*2^nivel (ver calculate_planet_resources): si el coste
              -- no cabe, reservar seria un bloqueo eterno, asi que se prueba el siguiente.
              -- Factor por madurez economica: minas <16 ahorra todo, 16-21 la mitad, 22+ nada.
              IF v_econ_reserve_metal = 0 AND v_econ_reserve_crystal = 0 AND v_econ_reserve_deut = 0 THEN
                v_econ_reserve_factor := CASE
                  WHEN GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl) >= 22 THEN 0.0
                  WHEN GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl) >= 16 THEN 0.5
                  ELSE 1.0
                END;
                IF v_econ_reserve_factor > 0
                   AND v_cost_metal <= 10000 * POWER(2, v_metal_storage_lvl)
                   AND v_cost_crystal <= 10000 * POWER(2, v_crystal_storage_lvl)
                   AND v_cost_deuterium <= 10000 * POWER(2, v_deut_tank_lvl)
                THEN
                  v_econ_reserve_metal := FLOOR(v_cost_metal * v_econ_reserve_factor)::bigint;
                  v_econ_reserve_crystal := FLOOR(v_cost_crystal * v_econ_reserve_factor)::bigint;
                  v_econ_reserve_deut := FLOOR(v_cost_deuterium * v_econ_reserve_factor)::bigint;
                END IF;
              END IF;$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R3: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  -- ------------------------------------------------------------------
  -- R4: al encolar un edificio, la reserva pasa al siguiente objetivo
  -- ------------------------------------------------------------------
  v_a := $a$                v_building_queued := true;$a$;
  v_b := $b$                v_building_queued := true;
                -- [VETERANO v14] Edificio encolado: liberar la reserva para que la
                -- siguiente vuelta del bucle la fije sobre el siguiente objetivo.
                v_econ_reserve_metal := 0;
                v_econ_reserve_crystal := 0;
                v_econ_reserve_deut := 0;$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R4: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  -- ------------------------------------------------------------------
  -- R5/R6/R7: la Fase C (naves) solo gasta el excedente sobre la reserva
  -- ------------------------------------------------------------------
  v_a := $a$FLOOR(v_resources.metal::numeric / v_ship.metal_cost)$a$;
  v_b := $b$FLOOR(GREATEST(0, v_resources.metal - v_econ_reserve_metal)::numeric / v_ship.metal_cost)$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R5: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  v_a := $a$FLOOR(v_resources.crystal::numeric / v_ship.crystal_cost)$a$;
  v_b := $b$FLOOR(GREATEST(0, v_resources.crystal - v_econ_reserve_crystal)::numeric / v_ship.crystal_cost)$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R6: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  v_a := $a$FLOOR(v_resources.deuterium::numeric / v_ship.deuterium_cost)$a$;
  v_b := $b$FLOOR(GREATEST(0, v_resources.deuterium - v_econ_reserve_deut)::numeric / v_ship.deuterium_cost)$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R7: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  -- ------------------------------------------------------------------
  -- R8: la Fase D (defensas) solo gasta el excedente sobre la reserva
  -- ------------------------------------------------------------------
  v_a := $a$            v_cost_deuterium := v_def.deuterium_cost::bigint * v_def_qty;$a$;
  v_b := $b$            v_cost_deuterium := v_def.deuterium_cost::bigint * v_def_qty;

            -- [VETERANO v14] La defensa solo gasta el excedente sobre la reserva economica.
            IF (v_resources.metal - v_econ_reserve_metal) < v_cost_metal
               OR (v_resources.crystal - v_econ_reserve_crystal) < v_cost_crystal
               OR (v_resources.deuterium - v_econ_reserve_deut) < v_cost_deuterium THEN
              CONTINUE;
            END IF;$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R8: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  -- ------------------------------------------------------------------
  -- R9: rol 'balanced' (88% de los planetas) — escalado sin techo
  -- ------------------------------------------------------------------
  v_a := $a$              IF v_deut_tank_lvl < 5 AND v_deut_synth_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;$a$;
  v_b := $b$              IF v_deut_tank_lvl < 5 AND v_deut_synth_lvl >= 10 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              -- [VETERANO v14] Escalado sin techo para no estancarse nunca.
              -- (a) Los almacenes deben seguir el ritmo de las minas: al llenarse se PIERDE
              --     produccion (cap = 10000*2^nivel) y ademas impide ahorrar para edificios caros.
              IF v_metal_storage_lvl < v_metal_mine_lvl - 6 AND v_metal_mine_lvl >= 12 THEN v_building_wish_list := array_append(v_building_wish_list, 'metal_storage'); END IF;
              IF v_crystal_storage_lvl < v_crystal_mine_lvl - 6 AND v_crystal_mine_lvl >= 12 THEN v_building_wish_list := array_append(v_building_wish_list, 'crystal_storage'); END IF;
              IF v_deut_tank_lvl < v_deut_synth_lvl - 6 AND v_deut_synth_lvl >= 12 THEN v_building_wish_list := array_append(v_building_wish_list, 'deuterium_tank'); END IF;
              -- (b) Nanite: divide entre 2 el tiempo de construccion por nivel. Sin esto los
              --     bots avanzados tardaban dias en cada edificio.
              IF v_robotics_lvl >= 10 AND v_nanite_level < 5 THEN v_building_wish_list := array_append(v_building_wish_list, 'nanite_factory'); END IF;
              -- (c) Techos altos de infraestructura para el juego tardio.
              IF v_robotics_lvl < 14 AND v_metal_mine_lvl >= 20 THEN v_building_wish_list := array_append(v_building_wish_list, 'robotics_factory'); END IF;
              IF v_shipyard_lvl < 16 AND v_robotics_lvl >= 8 THEN v_building_wish_list := array_append(v_building_wish_list, 'shipyard'); END IF;
              IF v_lab_lvl < 20 AND v_metal_mine_lvl >= 16 THEN v_building_wish_list := array_append(v_building_wish_list, 'research_lab'); END IF;$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R9: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  -- ------------------------------------------------------------------
  -- R10: registrar el evento 'attack_sent' (auditoria; no cambia comportamiento)
  -- ------------------------------------------------------------------
  v_a := $a$            IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
              v_fleets_sent := v_fleets_sent + 1;
              v_fleet_action_taken := true;
              EXIT;
            END IF;
          END LOOP;

          -- Fallback if no fresh spy reports: estimate risk from profile points$a$;
  v_b := $b$            IF COALESCE((v_fleet_result->>'success')::boolean, false) THEN
              v_fleets_sent := v_fleets_sent + 1;
              v_fleet_action_taken := true;
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'attack_sent', jsonb_build_object('role', v_planet_role, 'mode', v_attack_mode, 'target', v_target.galaxy || ':' || v_target.solar_system || ':' || v_target.position, 'attacker_power', v_attacker_power, 'defender_power', v_defender_power));
              EXIT;
            END IF;
          END LOOP;

          -- Fallback if no fresh spy reports: estimate risk from profile points$b$;
  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'R10: ancla encontrada % veces (esperado 1)', v_hits; END IF;
  v_def := replace(v_def, v_a, v_b);

  EXECUTE v_def;
  RAISE NOTICE 'bot_ai_tick() actualizada (FASE 14: reserva economica + escalado veterano).';
END
$mig$;

-- Verificacion dentro de la misma transaccion: si algo falta, se hace ROLLBACK.
DO $chk$
DECLARE v_src text; v_missing text := '';
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bot_ai_tick' AND p.prokind = 'f';

  IF position('v_econ_reserve_metal bigint := 0;' in v_src) = 0 THEN v_missing := v_missing || ' R1'; END IF;
  IF position('v_econ_reserve_factor := 1.0;' in v_src) = 0 THEN v_missing := v_missing || ' R2'; END IF;
  IF position('WHEN GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl) >= 22 THEN 0.0' in v_src) = 0 THEN v_missing := v_missing || ' R3'; END IF;
  IF position('GREATEST(0, v_resources.metal - v_econ_reserve_metal)' in v_src) = 0 THEN v_missing := v_missing || ' R5'; END IF;
  IF position('GREATEST(0, v_resources.crystal - v_econ_reserve_crystal)' in v_src) = 0 THEN v_missing := v_missing || ' R6'; END IF;
  IF position('GREATEST(0, v_resources.deuterium - v_econ_reserve_deut)' in v_src) = 0 THEN v_missing := v_missing || ' R7'; END IF;
  IF position('La defensa solo gasta el excedente' in v_src) = 0 THEN v_missing := v_missing || ' R8'; END IF;
  IF position('v_robotics_lvl >= 10 AND v_nanite_level < 5' in v_src) = 0 THEN v_missing := v_missing || ' R9'; END IF;
  IF position($q$'attack_sent'$q$ in v_src) = 0 THEN v_missing := v_missing || ' R10'; END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'Verificacion FALLIDA, faltan:%; se hace ROLLBACK', v_missing;
  END IF;
  RAISE NOTICE 'Verificacion OK: los 10 parches estan presentes.';
END
$chk$;

COMMIT;
