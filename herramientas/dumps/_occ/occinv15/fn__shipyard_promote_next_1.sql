CREATE OR REPLACE FUNCTION public._shipyard_promote_next(p_planet_id uuid, p_item_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Renumerar 1..N sin huecos (evita colas huerfanas que empiezan en 2)
  WITH r AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position, created_at, id) AS np
    FROM shipyard_queue
    WHERE planet_id = p_planet_id AND item_type = p_item_type
  )
  UPDATE shipyard_queue sq
  SET queue_position = r.np
  FROM r
  WHERE sq.id = r.id AND sq.queue_position IS DISTINCT FROM r.np;

  -- El nuevo activo arranca su tiempo COMPLETO desde ahora.
  -- Nunca hereda el reloj vencido del anterior.
  UPDATE shipyard_queue
  SET start_time = now(),
      current_unit_end_time = now()
        + (GREATEST(1, build_time_per_unit) || ' seconds')::interval
  WHERE planet_id = p_planet_id
    AND item_type = p_item_type
    AND queue_position = 1;

  -- Los que esperan NO corren tiempo.
  UPDATE shipyard_queue
  SET start_time = NULL, current_unit_end_time = NULL
  WHERE planet_id = p_planet_id
    AND item_type = p_item_type
    AND queue_position > 1
    AND (start_time IS NOT NULL OR current_unit_end_time IS NOT NULL);
END;
$function$

