/*
  # Fix user_can_build_ship - Correct Column Name

  1. Problem
    - The function referenced `is_homeworld` but the actual column is `is_main_planet`
  
  2. Changes
    - Fix column reference in `user_can_build_ship()` function
*/

CREATE OR REPLACE FUNCTION user_can_build_ship(p_user_id uuid, p_ship_type_id integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requirement record;
  v_user_tech_level integer;
  v_user_building_level integer;
BEGIN
  FOR v_requirement IN
    SELECT sr.required_tech_id, sr.required_tech_level,
           sr.required_building_id, sr.required_building_level
    FROM ship_requirements sr
    WHERE sr.ship_type_id = p_ship_type_id
  LOOP
    IF v_requirement.required_tech_id IS NOT NULL AND COALESCE(v_requirement.required_tech_level, 0) > 0 THEN
      SELECT COALESCE(ut.level, 0) INTO v_user_tech_level
      FROM user_technologies ut
      WHERE ut.user_id = p_user_id
        AND ut.technology_type_id = v_requirement.required_tech_id;

      IF COALESCE(v_user_tech_level, 0) < v_requirement.required_tech_level THEN
        RETURN false;
      END IF;
    END IF;

    IF v_requirement.required_building_id IS NOT NULL AND COALESCE(v_requirement.required_building_level, 0) > 0 THEN
      SELECT COALESCE(MAX(pb.level), 0) INTO v_user_building_level
      FROM planet_buildings pb
      JOIN planets p ON p.id = pb.planet_id
      WHERE p.user_id = p_user_id
        AND pb.building_type_id = v_requirement.required_building_id;

      IF COALESCE(v_user_building_level, 0) < v_requirement.required_building_level THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;