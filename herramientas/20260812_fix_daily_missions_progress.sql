-- ============================================================================
-- FIX: las misiones diarias GRATIS no progresan
-- ============================================================================
-- Diagnostico verificado empiricamente contra la base de datos de produccion.
--
-- CAUSA 1 - assign_daily_missions: filtro de fecha roto.
--   La funcion INSERTA con expires_at = (current_date + 1 dia)::date  -> MAÑANA
--   pero CUENTA/EXCLUYE con  expires_at::date = current_date          -> HOY
--   Esos dos valores NUNCA coinciden, por lo que:
--     * v_count siempre valia 0  -> siempre intentaba asignar 3 misiones nuevas
--     * la subconsulta anti-duplicados no excluia nada
--   Consecuencia real medida: 12 de 25 jugadores tenian 4 misiones en vez de 3.
--   Solo el ON CONFLICT evitaba duplicados exactos.
--
-- CAUSA 2 - trg_building_completed_daily_mission: solo AFTER UPDATE.
--   process_building_queue_internal hace INSERT en planet_buildings cuando el
--   edificio se construye por PRIMERA VEZ (no existe fila previa) y UPDATE solo
--   en las mejoras posteriores. El trigger era AFTER UPDATE OF level, asi que
--   el primer nivel de cada edificio NO sumaba a la mision "Construye N niveles".
--   Verificado: "build por INSERT: antes=5 despues=5 => NO CUENTA".
--
-- CAUSA 3 - trg_resource_collect_daily_mission: perdida por redondeo.
--   Hacia (NEW.metal - OLD.metal)::integer. Cada sincronizacion parcial que
--   producia menos de 0.5 de recurso se redondeaba a 0 y se perdia para siempre.
--   Verificado: "collect_metal (+0.4) => SE PIERDE (truncado a 0)".
--   Se sustituye por FLOOR(NEW.x) - FLOOR(OLD.x), que es telescopico: la suma
--   de todos los ticks equivale exactamente al recurso entero producido, sin
--   perdidas ni excesos.
--
-- NO SE TOCA: la logica de recompensas, los objetivos (target_count), las
-- misiones premium, ni los triggers de research/attack/fleet (verificados OK).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- CAUSA 1: contar/excluir por misiones VIGENTES (expires_at > now()), que es
--          la intencion real, en lugar de por una fecha que nunca casa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_daily_missions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today    date := current_date;
  v_expires  date := (current_date + interval '1 day')::date;
  v_count    integer;
  v_missions integer[];
  v_mid      integer;
BEGIN
  -- Misiones que el jugador ya tiene VIGENTES (no expiradas).
  SELECT COUNT(*) INTO v_count
  FROM user_daily_missions
  WHERE user_id = p_user_id
    AND expires_at > now();

  IF v_count >= 3 THEN
    RETURN jsonb_build_object('success', true, 'count', v_count, 'message', 'Ya tienes 3 misiones asignadas hoy');
  END IF;

  -- Excluir las que ya tiene vigentes, para no repetir.
  SELECT ARRAY_AGG(id) INTO v_missions
  FROM (
    SELECT dm.id FROM daily_missions dm
    WHERE dm.is_active = true
      AND (dm.cost_fxu IS NULL OR dm.cost_fxu = 0)
      AND dm.id NOT IN (
        SELECT udm.mission_id FROM user_daily_missions udm
        WHERE udm.user_id = p_user_id
          AND udm.expires_at > now()
      )
    ORDER BY random()
    LIMIT (3 - v_count)
  ) sub;

  IF v_missions IS NULL THEN
    RETURN jsonb_build_object('success', true, 'count', v_count, 'message', 'Ya tienes tus misiones de hoy');
  END IF;

  FOREACH v_mid IN ARRAY v_missions
  LOOP
    INSERT INTO user_daily_missions (user_id, mission_id, progress, expires_at)
    VALUES (p_user_id, v_mid, 0, v_expires)
    ON CONFLICT (user_id, mission_id, expires_at) DO NOTHING;
  END LOOP;

  SELECT COUNT(*) INTO v_count
  FROM user_daily_missions
  WHERE user_id = p_user_id AND expires_at > now();

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$function$;

-- ---------------------------------------------------------------------------
-- CAUSA 2: contar tambien el primer nivel de un edificio nuevo (INSERT).
--          Se conserva intacto el trigger de UPDATE ya existente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_building_inserted_daily_mission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF COALESCE(NEW.level, 0) > 0 THEN
    SELECT user_id INTO v_user_id FROM planets WHERE id = NEW.planet_id;
    IF v_user_id IS NOT NULL THEN
      PERFORM update_daily_mission_progress(v_user_id, 'build', NEW.level);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_building_inserted_daily_mission ON public.planet_buildings;
CREATE TRIGGER trg_building_inserted_daily_mission
AFTER INSERT ON public.planet_buildings
FOR EACH ROW
EXECUTE FUNCTION public.trg_building_inserted_daily_mission();

-- ---------------------------------------------------------------------------
-- CAUSA 3: acumulacion exacta de recursos (sin perdida por redondeo).
--          FLOOR(NEW) - FLOOR(OLD) es telescopico: la suma de todos los ticks
--          da exactamente el total entero producido.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_resource_collect_daily_mission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id        uuid;
  v_metal_diff     bigint;
  v_crystal_diff   bigint;
  v_deuterium_diff bigint;
BEGIN
  IF NEW.last_update > OLD.last_update THEN
    SELECT user_id INTO v_user_id FROM planets WHERE id = NEW.planet_id;
    IF v_user_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Diferencia de la PARTE ENTERA: no pierde los decimales acumulados
    -- entre sincronizaciones consecutivas.
    v_metal_diff     := GREATEST(0, FLOOR(COALESCE(NEW.metal, 0))      - FLOOR(COALESCE(OLD.metal, 0)))::bigint;
    v_crystal_diff   := GREATEST(0, FLOOR(COALESCE(NEW.crystal, 0))    - FLOOR(COALESCE(OLD.crystal, 0)))::bigint;
    v_deuterium_diff := GREATEST(0, FLOOR(COALESCE(NEW.deuterium, 0))  - FLOOR(COALESCE(OLD.deuterium, 0)))::bigint;

    -- update_daily_mission_progress recibe integer: se acota para no desbordar.
    IF v_metal_diff > 0 THEN
      PERFORM update_daily_mission_progress(v_user_id, 'collect_metal', LEAST(v_metal_diff, 2147483647)::integer);
    END IF;

    IF v_crystal_diff > 0 THEN
      PERFORM update_daily_mission_progress(v_user_id, 'collect_crystal', LEAST(v_crystal_diff, 2147483647)::integer);
    END IF;

    IF v_deuterium_diff > 0 THEN
      PERFORM update_daily_mission_progress(v_user_id, 'collect_deuterium', LEAST(v_deuterium_diff, 2147483647)::integer);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
