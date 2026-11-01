-- =====================================================================
-- FIX: piloto automatico completaba naves/defensas de forma instantanea
-- =====================================================================
-- CAUSA:
--   bot_process_queues(p_bot_id) -> llamada por bot_ai_tick() cada 5 min
--   para toda cuenta con piloto automatico activo. Su seccion 2 duplicaba
--   (mal) la logica de la cola de hangar:
--     a) NO filtraba queue_position = 1  -> tocaba todos los lotes a la vez
--     b) trataba start_time como "inicio del LOTE" (semantica obsoleta),
--        cuando el motor canonico lo usa como "inicio de la unidad en curso"
--     c) al actualizar NO reescribia start_time, de modo que en cada tick
--        volvia a contar desde el inicio del lote y lo sumaba otra vez a
--        quantity_completed -> DOBLE CONTEO acumulativo -> el lote se
--        terminaba casi al instante (naves y defensas por igual).
--   Sin piloto automatico el jugador solo pasa por process_shipyard_queue_core,
--   que es correcto: por eso el bug solo se veia con el piloto pagado.
--
-- SOLUCION:
--   La seccion 2 delega en el motor canonico process_shipyard_queue_core(planet_id),
--   exactamente el mismo que usa la cola manual.
--
-- ALCANCE: solo la seccion 2 (hangar). Las secciones 1 (edificios) y 3
--   (investigacion) quedan BYTE A BYTE identicas. Misma firma, mismo
--   RETURNS void, mismo SECURITY DEFINER y search_path: no hace falta
--   recargar PostgREST ni tocar nada mas del juego.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.bot_process_queues(p_bot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bq RECORD;
  v_sq RECORD;
  v_ut RECORD;
  v_completed_qty integer;
  v_lunar_base_id integer;
BEGIN
  SELECT id INTO v_lunar_base_id FROM building_types WHERE code = 'lunar_base' LIMIT 1;

  -- 1. Process completed BUILDING queues
  FOR v_bq IN
    SELECT bq.*, p.user_id
    FROM building_queue bq
    JOIN planets p ON p.id = bq.planet_id
    WHERE p.user_id = p_bot_id
      AND bq.end_time <= now()
    ORDER BY bq.end_time ASC
  LOOP
    INSERT INTO planet_buildings (planet_id, building_type_id, level)
    VALUES (v_bq.planet_id, v_bq.building_type_id, v_bq.target_level)
    ON CONFLICT (planet_id, building_type_id)
    DO UPDATE SET level = v_bq.target_level;

    UPDATE planets SET fields_used = (
      SELECT COALESCE(SUM(level), 0) FROM planet_buildings WHERE planet_id = v_bq.planet_id
    ) WHERE id = v_bq.planet_id;

    -- [FIX 2026-05-06] Lunar base on moon: grant +3 fields per level
    IF v_lunar_base_id IS NOT NULL AND v_bq.building_type_id = v_lunar_base_id THEN
      UPDATE planets
      SET fields_max = GREATEST(fields_max, 1 + v_bq.target_level * 3)
      WHERE id = v_bq.planet_id AND planet_type = 'moon';
    END IF;

    DELETE FROM building_queue WHERE id = v_bq.id;
  END LOOP;

  -- 2. Process completed SHIPYARD queues
  -- [AUTOPILOT-SHYFIX] Delegado al motor canonico. Ver cabecera del script.
  FOR v_sq IN
    SELECT DISTINCT sq.planet_id AS planet_id
    FROM shipyard_queue sq
    JOIN planets p ON p.id = sq.planet_id
    WHERE p.user_id = p_bot_id
  LOOP
    PERFORM public.process_shipyard_queue_core(v_sq.planet_id);
  END LOOP;

  -- 3. Process completed RESEARCH
  FOR v_ut IN
    SELECT * FROM user_technologies
    WHERE user_id = p_bot_id
      AND is_researching = true
      AND research_end_time <= now()
  LOOP
    UPDATE user_technologies
    SET level = level + 1,
        is_researching = false,
        research_end_time = NULL,
        research_planet_id = NULL
    WHERE id = v_ut.id;
  END LOOP;
END;
$function$;
