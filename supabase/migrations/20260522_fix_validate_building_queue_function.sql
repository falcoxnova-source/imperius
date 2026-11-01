CREATE OR REPLACE FUNCTION public.validate_building_queue(p_planet_id uuid, p_building_type_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_validation jsonb;
  v_building_type RECORD;
  v_current_level integer;
  v_queued_count integer;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
BEGIN
  v_validation := validate_building_requirements(p_planet_id, p_building_type_id);
  IF (v_validation->>'valid')::boolean IS DISTINCT FROM true THEN
    RETURN v_validation;
  END IF;

  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Building type not found');
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_current_level
  FROM planet_buildings pb
  WHERE pb.planet_id = p_planet_id AND pb.building_type_id = p_building_type_id;

  SELECT COUNT(*) INTO v_queued_count
  FROM building_queue
  WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;

  v_cost_metal := FLOOR(v_building_type.base_metal * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));
  v_cost_crystal := FLOOR(v_building_type.base_crystal * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));
  v_cost_deuterium := FLOOR(v_building_type.base_deuterium * POWER(v_building_type.cost_factor, v_current_level + v_queued_count));

  RETURN jsonb_build_object(
    'valid', true,
    'cost_metal', v_cost_metal,
    'cost_crystal', v_cost_crystal,
    'cost_deuterium', v_cost_deuterium
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.validate_building_queue(uuid, integer) TO authenticated;
