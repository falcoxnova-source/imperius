CREATE OR REPLACE FUNCTION public.secure_activate_building_queue(p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_first_item RECORD;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Verify ownership
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;
  
  -- Get first queue item
  SELECT * INTO v_first_item 
  FROM building_queue 
  WHERE planet_id = p_planet_id AND queue_position = 1;
  
  IF v_first_item IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'No items in queue');
  END IF;
  
  -- Only activate if not already started
  IF v_first_item.start_time IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already started');
  END IF;
  
  -- Activate with server time
  UPDATE building_queue
  SET 
    start_time = now(),
    end_time = now() + (build_time || ' seconds')::interval
  WHERE id = v_first_item.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'activated_id', v_first_item.id,
    'end_time', now() + (v_first_item.build_time || ' seconds')::interval
  );
END;
$function$

