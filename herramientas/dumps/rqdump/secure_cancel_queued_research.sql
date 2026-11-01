CREATE OR REPLACE FUNCTION public.secure_cancel_queued_research(p_queue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_item RECORD;
  v_refund_planet_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_item
  FROM research_queue
  WHERE id = p_queue_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queued research not found');
  END IF;

  IF v_item.status NOT IN ('queued', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research is not queued');
  END IF;

  -- Devolver los recursos al planeta que los pago (o al principal si ya no existe)
  SELECT p.id INTO v_refund_planet_id
  FROM planets p
  WHERE p.id = v_item.planet_id AND p.user_id = v_user_id;

  IF v_refund_planet_id IS NULL THEN
    SELECT p.id INTO v_refund_planet_id
    FROM planets p
    WHERE p.user_id = v_user_id
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  IF v_refund_planet_id IS NOT NULL THEN
    UPDATE planet_resources
    SET metal = metal + v_item.metal_cost,
        crystal = crystal + v_item.crystal_cost,
        deuterium = deuterium + v_item.deuterium_cost,
        last_update = now()
    WHERE planet_id = v_refund_planet_id;
  END IF;

  DELETE FROM research_queue WHERE id = p_queue_id;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position ASC, created_at ASC) AS new_pos
    FROM research_queue
    WHERE user_id = v_user_id AND status IN ('queued', 'pending')
  )
  UPDATE research_queue rq
  SET queue_position = ranked.new_pos
  FROM ranked
  WHERE rq.id = ranked.id;

  RETURN jsonb_build_object(
    'success', true,
    'refund_metal', v_item.metal_cost,
    'refund_crystal', v_item.crystal_cost,
    'refund_deuterium', v_item.deuterium_cost,
    'refund_planet_id', v_refund_planet_id
  );
END;
$function$

