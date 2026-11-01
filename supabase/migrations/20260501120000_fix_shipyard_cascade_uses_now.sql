-- =====================================================================
-- FIX: Shipyard cascade no debe completar items en cola usando timestamps
-- pasados. Solo el item ACTIVO (posición 1) progresa offline; los demás
-- arrancan su contador desde NOW() cuando les toca.
--
-- BUG ANTERIOR:
--   Al completar el item N, el siguiente item recibía
--     start_time = v_item_completion_time  (hora REAL en que terminó N,
--                                            que puede ser horas en el pasado)
--   En la siguiente iteración del LOOP:
--     elapsed = NOW() - start_time  →  horas
--     units_to_complete = floor(elapsed / build_time_per_unit) capado a 1
--     → completa instantáneamente, cascada → todos los items en cola
--       terminan al instante al reconectar.
--
-- CASO REPRODUCIBLE:
--   Encolar Destructor de Estrellas + 5 Estrellas de la Muerte,
--   desconectarse hasta que el Destructor termine, y al reconectar
--   las 5 Estrellas aparecen completadas a la vez.
--
-- FIX:
--   start_time = NOW() para el item cascadeado.
--   Esto hace que el siguiente loop calcule elapsed=0 → 0 unidades → EXIT.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.process_shipyard_queue_internal(
  p_planet_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_planet_exists boolean;
  v_queue_item shipyard_queue%ROWTYPE;
  v_total_units_completed integer := 0;
  v_units_to_complete integer;
  v_elapsed_seconds numeric;
  v_time_per_unit numeric;
  v_max_iterations integer := 50;
  v_iteration integer := 0;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = p_user_id
  ) INTO v_planet_exists;

  IF NOT v_planet_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;

  LOOP
    v_iteration := v_iteration + 1;
    IF v_iteration > v_max_iterations THEN
      EXIT;
    END IF;

    SELECT * INTO v_queue_item
    FROM shipyard_queue
    WHERE planet_id = p_planet_id
    ORDER BY queue_position
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      EXIT;
    END IF;

    -- Si el item activo aún no tiene start_time, inicializar desde AHORA.
    IF v_queue_item.start_time IS NULL THEN
      v_queue_item.start_time := NOW();
      UPDATE shipyard_queue
      SET start_time = v_queue_item.start_time,
          current_unit_end_time = v_queue_item.start_time
                                  + (build_time_per_unit || ' seconds')::interval
      WHERE id = v_queue_item.id;
    END IF;

    v_time_per_unit := v_queue_item.build_time_per_unit;
    IF v_time_per_unit <= 0 THEN
      v_time_per_unit := 1;
    END IF;

    v_elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - v_queue_item.start_time));

    v_units_to_complete := LEAST(
      FLOOR(v_elapsed_seconds / v_time_per_unit)::integer
        - v_queue_item.quantity_completed,
      v_queue_item.quantity - v_queue_item.quantity_completed
    );

    IF v_units_to_complete <= 0 THEN
      EXIT;
    END IF;

    -- Insertar las unidades producidas
    -- (FIX adicional: la tabla usa ship_type_id/defense_type_id, no type_id)
    IF v_queue_item.item_type = 'ship' AND v_queue_item.ship_type_id IS NOT NULL THEN
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (p_planet_id, v_queue_item.ship_type_id, v_units_to_complete)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = planet_ships.quantity + v_units_to_complete;
    ELSIF v_queue_item.item_type = 'defense' AND v_queue_item.defense_type_id IS NOT NULL THEN
      INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
      VALUES (p_planet_id, v_queue_item.defense_type_id, v_units_to_complete)
      ON CONFLICT (planet_id, defense_type_id)
      DO UPDATE SET quantity = planet_defenses.quantity + v_units_to_complete;
    END IF;

    v_total_units_completed := v_total_units_completed + v_units_to_complete;

    IF v_queue_item.quantity_completed + v_units_to_complete
         >= v_queue_item.quantity
    THEN
      -- Item completado totalmente → eliminar y avanzar la cola
      DELETE FROM shipyard_queue WHERE id = v_queue_item.id;

      UPDATE shipyard_queue
      SET queue_position = queue_position - 1
      WHERE planet_id = p_planet_id
        AND queue_position > 1;

      -- ✅ FIX: el siguiente item arranca desde AHORA, no desde la hora
      --        pasada en que terminó el anterior. Así su tiempo de
      --        construcción se respeta íntegramente.
      UPDATE shipyard_queue
      SET start_time = NOW(),
          current_unit_end_time = NOW()
                                  + (build_time_per_unit || ' seconds')::interval
      WHERE planet_id = p_planet_id
        AND queue_position = 1
        AND start_time IS NULL;

      -- El siguiente ciclo del LOOP verá elapsed=0 → units_to_complete=0
      -- → EXIT natural. Solo cascadea si quedan items, no los completa.

    ELSE
      -- Avance parcial: actualizar progreso y siguiente unit_end_time
      UPDATE shipyard_queue
      SET quantity_completed = quantity_completed + v_units_to_complete,
          current_unit_end_time = v_queue_item.start_time
            + ((v_queue_item.quantity_completed + v_units_to_complete + 1)
               * v_time_per_unit || ' seconds')::interval
      WHERE id = v_queue_item.id;
      EXIT;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'completed_units', v_total_units_completed
  );
END;
$function$;

COMMENT ON FUNCTION public.process_shipyard_queue_internal(uuid, uuid) IS
  'Procesa la cola del astillero respetando build_time por unidad. '
  'Solo el item activo (posición 1) progresa con el tiempo offline; '
  'los items en cola arrancan desde NOW() cuando les toca. '
  'Fix aplicado 2026-05-01: evita que toda la cola se complete al reconectar.';
