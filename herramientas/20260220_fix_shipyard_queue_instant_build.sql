-- =====================================================================
-- FIX: naves/defensas del astillero completandose de golpe sin esperar
-- el tiempo de construccion.
--
-- Diagnostico (verificado contra la BD de produccion):
--   Existen varios procesadores de la cola del astillero con logica
--   INCOHERENTE. Los correctos completan unidad a unidad; los siguientes
--   completaban el LOTE ENTERO en cuanto vencia la PRIMERA unidad, y
--   ademas estaban expuestos a los roles anon/authenticated:
--
--     1. process_next_shipyard_unit(planet)  -> sin control de tiempo NI
--        de propietario: entregaba +1 unidad por cada llamada.
--     2. global_process_all_expired_queues() -> v_units_to_complete =
--        quantity - quantity_completed (lote completo de una vez).
--     3. process_all_user_shipyard_queues()  -> igual, y sin filtrar
--        queue_position = 1.
--     4. instant_complete_shipyard(uuid,uuid) -> referencia columnas que
--        no existen (end_time, item_id): siempre falla.
--
-- Ninguna de las cuatro es llamada por el frontend (src/) ni por cron ni
-- por otra funcion de la BD (verificado). La logica de negocio (tiempos,
-- costes, orden de cola, VIP, planos) NO se toca: solo se corrige el
-- calculo de unidades vencidas para que coincida con el procesador que
-- ya era correcto (process_completed_shipyard_queue).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. process_next_shipyard_unit: exigir que la unidad haya vencido de
--    verdad y que sea el item activo (posicion 1).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_next_shipyard_unit(p_planet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_item RECORD;
  v_ship_type ship_types%ROWTYPE;
  v_defense_type defense_types%ROWTYPE;
BEGIN
  -- Solo el item ACTIVO (posicion 1) y solo si su unidad actual ya vencio.
  SELECT * INTO v_queue_item
  FROM shipyard_queue
  WHERE planet_id = p_planet_id
    AND queue_position = 1
    AND quantity > quantity_completed
    AND current_unit_end_time IS NOT NULL
    AND current_unit_end_time <= now()
  ORDER BY queue_position ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  BEGIN
    IF v_queue_item.item_type = 'ship' THEN
      SELECT * INTO v_ship_type FROM ship_types WHERE id = v_queue_item.ship_type_id;

      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (p_planet_id, v_queue_item.ship_type_id, 1)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = planet_ships.quantity + 1;

    ELSIF v_queue_item.item_type = 'defense' THEN
      SELECT * INTO v_defense_type FROM defense_types WHERE id = v_queue_item.defense_type_id;

      INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
      VALUES (p_planet_id, v_queue_item.defense_type_id, 1)
      ON CONFLICT (planet_id, defense_type_id)
      DO UPDATE SET quantity = planet_defenses.quantity + 1;
    END IF;

    UPDATE shipyard_queue
    SET quantity_completed = quantity_completed + 1,
        current_unit_end_time = CASE
          WHEN quantity_completed + 1 >= quantity THEN NULL
          ELSE now() + (build_time_per_unit || ' seconds')::interval
        END,
        start_time = now()
    WHERE id = v_queue_item.id;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Shipyard queue item % failed: %', v_queue_item.id, SQLERRM;

    UPDATE shipyard_queue
    SET quantity_completed = quantity
    WHERE id = v_queue_item.id;
  END;
END;
$function$;

-- ---------------------------------------------------------------------
-- 2. process_all_user_shipyard_queues: delegar en el procesador que ya
--    era correcto (unidad a unidad) en vez de vaciar el lote entero.
--    Misma firma y mismo formato de respuesta.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_all_user_shipyard_queues()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_planet record;
  v_result jsonb;
  v_completed_units integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  FOR v_planet IN
    SELECT p.id
    FROM planets p
    WHERE p.user_id = v_user_id
      AND EXISTS (SELECT 1 FROM shipyard_queue sq WHERE sq.planet_id = p.id)
  LOOP
    v_result := process_completed_shipyard_queue(v_planet.id);
    IF COALESCE((v_result->>'success')::boolean, false) THEN
      v_completed_units := v_completed_units
        + COALESCE((v_result->>'completed_units')::integer, 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'completed_units', v_completed_units);
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. global_process_all_expired_queues: parche textual sobre la seccion
--    del astillero. Las secciones de edificios e investigacion quedan
--    intactas.
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  v_def  text;
  v_prev text;
BEGIN
  SELECT replace(pg_get_functiondef(p.oid), E'\r', '')
    INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'global_process_all_expired_queues';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'No se encontro public.global_process_all_expired_queues';
  END IF;

  -- 3.a Procesar solo el item ACTIVO de cada planeta.
  v_prev := v_def;
  v_def := regexp_replace(
    v_def,
    'WHERE sq\.current_unit_end_time IS NOT NULL\s*AND sq\.current_unit_end_time <= NOW\(\)',
    'WHERE sq.queue_position = 1' || E'\n'
    || 'AND sq.current_unit_end_time IS NOT NULL' || E'\n'
    || 'AND sq.current_unit_end_time <= NOW()'
  );
  IF v_def = v_prev THEN
    RAISE EXCEPTION 'Patron 3.a no encontrado';
  END IF;

  -- 3.b Completar solo las unidades realmente vencidas, no el lote entero.
  v_prev := v_def;
  v_def := regexp_replace(
    v_def,
    'v_units_to_complete := v_queue_item\.quantity - v_queue_item\.quantity_completed;',
    $r$v_units_to_complete := LEAST(
1 + FLOOR(
EXTRACT(EPOCH FROM (NOW() - v_queue_item.current_unit_end_time))
/ GREATEST(1, v_queue_item.build_time_per_unit)
)::integer,
v_queue_item.quantity - v_queue_item.quantity_completed
);$r$
  );
  IF v_def = v_prev THEN
    RAISE EXCEPTION 'Patron 3.b no encontrado';
  END IF;

  -- 3.c Borrar el item solo si termino; si no, guardar progreso y
  --     reprogramar la siguiente unidad. Al terminar, el siguiente item
  --     arranca desde AHORA (no hereda tiempo pasado).
  v_prev := v_def;
  v_def := regexp_replace(
    v_def,
    'DELETE FROM shipyard_queue WHERE id = v_queue_item\.id;\s*'
    || 'UPDATE shipyard_queue SET queue_position = queue_position - 1\s*'
    || 'WHERE planet_id = v_queue_item\.planet_id AND queue_position > v_queue_item\.queue_position;',
    $r$IF v_queue_item.quantity_completed + v_units_to_complete >= v_queue_item.quantity THEN
DELETE FROM shipyard_queue WHERE id = v_queue_item.id;
UPDATE shipyard_queue
SET queue_position = queue_position - 1,
start_time = CASE WHEN queue_position = v_queue_item.queue_position + 1 THEN NOW() ELSE start_time END,
current_unit_end_time = CASE WHEN queue_position = v_queue_item.queue_position + 1
THEN NOW() + (build_time_per_unit || ' seconds')::interval
ELSE current_unit_end_time END
WHERE planet_id = v_queue_item.planet_id AND queue_position > v_queue_item.queue_position;
ELSE
UPDATE shipyard_queue
SET quantity_completed = quantity_completed + v_units_to_complete,
current_unit_end_time = NOW() + (v_queue_item.build_time_per_unit || ' seconds')::interval
WHERE id = v_queue_item.id;
END IF;$r$
  );
  IF v_def = v_prev THEN
    RAISE EXCEPTION 'Patron 3.c no encontrado';
  END IF;

  EXECUTE v_def;
  RAISE NOTICE 'global_process_all_expired_queues parcheada correctamente';
END
$do$;

-- ---------------------------------------------------------------------
-- 4. Quitar de la API publica los procesadores que el cliente nunca debe
--    invocar. El frontend solo usa process_completed_shipyard_queue y
--    instant_complete_shipyard_item, que no se tocan.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.process_next_shipyard_unit(uuid)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.global_process_all_expired_queues()     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.instant_complete_shipyard(uuid, uuid)   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_all_user_shipyard_queues()      FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_completed_shipyard_queue(uuid)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_shipyard_queue_internal(uuid, uuid) FROM anon, authenticated;

COMMIT;

-- Verificacion
SELECT p.proname,
       (p.prosrc LIKE '%GREATEST(1, v_queue_item.build_time_per_unit)%') AS calculo_por_unidad
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname = 'global_process_all_expired_queues';

SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS puede
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('authenticated','anon')) r
WHERE n.nspname='public'
  AND p.proname IN ('process_next_shipyard_unit','global_process_all_expired_queues',
                    'process_all_user_shipyard_queues','process_completed_shipyard_queue',
                    'instant_complete_shipyard','instant_complete_shipyard_item',
                    'process_shipyard_queue_internal')
ORDER BY 1,2;
