CREATE OR REPLACE FUNCTION public.sync_planet_resources(p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_calculated jsonb;
  v_user_id uuid;
BEGIN
  -- Verify ownership
  SELECT user_id INTO v_user_id FROM planets WHERE id = p_planet_id;
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  
  -- Calculate current resources
  v_calculated := calculate_planet_resources(p_planet_id);
  
  IF v_calculated ? 'error' THEN
    RETURN v_calculated;
  END IF;
  
  -- Update the database
  UPDATE planet_resources
  SET 
    metal = (v_calculated->>'metal')::numeric,
    crystal = (v_calculated->>'crystal')::numeric,
    deuterium = (v_calculated->>'deuterium')::numeric,
    metal_per_hour = (v_calculated->>'metal_per_hour')::numeric,
    crystal_per_hour = (v_calculated->>'crystal_per_hour')::numeric,
    deuterium_per_hour = (v_calculated->>'deuterium_per_hour')::numeric,
    metal_storage = (v_calculated->>'metal_storage')::numeric,
    crystal_storage = (v_calculated->>'crystal_storage')::numeric,
    deuterium_storage = (v_calculated->>'deuterium_storage')::numeric,
    energy_used = (v_calculated->>'energy_used')::numeric,
    energy_max = (v_calculated->>'energy_max')::numeric,
    last_update = now()
  WHERE planet_id = p_planet_id;
  
  -- Return updated values with new timestamp
  RETURN jsonb_build_object(
    'metal', (v_calculated->>'metal')::numeric,
    'crystal', (v_calculated->>'crystal')::numeric,
    'deuterium', (v_calculated->>'deuterium')::numeric,
    'metal_per_hour', (v_calculated->>'metal_per_hour')::numeric,
    'crystal_per_hour', (v_calculated->>'crystal_per_hour')::numeric,
    'deuterium_per_hour', (v_calculated->>'deuterium_per_hour')::numeric,
    'metal_storage', (v_calculated->>'metal_storage')::numeric,
    'crystal_storage', (v_calculated->>'crystal_storage')::numeric,
    'deuterium_storage', (v_calculated->>'deuterium_storage')::numeric,
    'energy_used', (v_calculated->>'energy_used')::numeric,
    'energy_max', (v_calculated->>'energy_max')::numeric,
    'last_update', now()
  );
END;
$function$

