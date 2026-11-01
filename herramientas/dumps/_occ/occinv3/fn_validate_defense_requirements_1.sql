CREATE OR REPLACE FUNCTION public.validate_defense_requirements(p_planet_id uuid, p_defense_type_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_requirement RECORD;
  v_current_level integer;
  v_missing_reqs jsonb := '[]'::jsonb;
  v_planet RECORD;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Planet not found');
  END IF;

  FOR v_requirement IN
    SELECT dr.*, 
           bt.name as building_name, 
           tt.name as tech_name
    FROM defense_requirements dr
    LEFT JOIN building_types bt ON bt.id = dr.required_building_id
    LEFT JOIN technology_types tt ON tt.id = dr.required_tech_id
    WHERE dr.defense_type_id = p_defense_type_id
  LOOP
    IF v_requirement.required_building_id IS NOT NULL THEN
      SELECT COALESCE(pb.level, 0) INTO v_current_level
      FROM planet_buildings pb
      WHERE pb.planet_id = p_planet_id
        AND pb.building_type_id = v_requirement.required_building_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_building_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'building',
          'name', v_requirement.building_name,
          'required', v_requirement.required_building_level,
          'current', v_current_level
        );
      END IF;
    END IF;

    IF v_requirement.required_tech_id IS NOT NULL THEN
      SELECT COALESCE(ut.level, 0) INTO v_current_level
      FROM user_technologies ut
      WHERE ut.user_id = v_planet.user_id
        AND ut.technology_type_id = v_requirement.required_tech_id;
      
      IF v_current_level IS NULL THEN v_current_level := 0; END IF;
      
      IF v_current_level < v_requirement.required_tech_level THEN
        v_missing_reqs := v_missing_reqs || jsonb_build_object(
          'type', 'technology',
          'name', v_requirement.tech_name,
          'required', v_requirement.required_tech_level,
          'current', v_current_level
        );
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_missing_reqs) > 0 THEN
    RETURN jsonb_build_object('valid', false, 'missing', v_missing_reqs);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$function$

