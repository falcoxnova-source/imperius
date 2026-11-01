CREATE OR REPLACE FUNCTION public.promote_next_queued_research(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next    RECORD;
  v_now     timestamptz;
  v_end     timestamptz;
  v_planet  uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Solo puede haber UNA investigacion activa a la vez
  IF EXISTS (
    SELECT 1 FROM user_technologies
    WHERE user_id = p_user_id AND is_researching = true
  ) THEN
    RETURN false;
  END IF;

  -- En vacaciones no se arranca nada
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id AND COALESCE(vacation_mode, false) = true
  ) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_next
  FROM research_queue
  WHERE user_id = p_user_id
    AND status IN ('queued', 'pending')
  ORDER BY queue_position ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- El planeta de la cola puede haber desaparecido (colonia abandonada,
  -- planeta destruido...). Se resuelve a uno valido del jugador.
  SELECT p.id INTO v_planet
  FROM planets p
  WHERE p.id = v_next.planet_id AND p.user_id = p_user_id;

  IF v_planet IS NULL THEN
    SELECT p.id INTO v_planet
    FROM planets p
    WHERE p.user_id = p_user_id
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  v_now := now();
  v_end := v_now + (GREATEST(1, v_next.research_time) || ' seconds')::interval;

  INSERT INTO user_technologies (
    user_id, technology_type_id, level, is_researching,
    research_start_time, research_end_time, research_planet_id
  ) VALUES (
    p_user_id, v_next.technology_type_id, GREATEST(0, v_next.target_level - 1), true,
    v_now, v_end, v_planet
  )
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
    is_researching      = true,
    research_start_time = v_now,
    research_end_time   = v_end,
    research_planet_id  = v_planet;

  DELETE FROM research_queue WHERE id = v_next.id;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position ASC, created_at ASC) AS new_pos
    FROM research_queue
    WHERE user_id = p_user_id AND status IN ('queued', 'pending')
  )
  UPDATE research_queue rq
  SET queue_position = ranked.new_pos
  FROM ranked
  WHERE rq.id = ranked.id;

  RETURN true;
END;
$function$

