/*
  # Check ally depot planets function

  1. New Functions
    - `get_ally_depot_planet_ids(p_planet_ids uuid[])` 
      - Accepts an array of planet IDs
      - Returns only those planet IDs that belong to alliance members of the calling user
        AND have alliance_depot building (building_type_id = 18) at level >= 1
      - Uses SECURITY DEFINER to bypass RLS on planet_buildings
  
  2. Security
    - Only returns data for planets belonging to verified alliance members
    - Validates the caller is authenticated and in an alliance
*/

CREATE OR REPLACE FUNCTION get_ally_depot_planet_ids(p_planet_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_alliance_id uuid;
  v_result uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT alliance_id INTO v_alliance_id
  FROM alliance_members
  WHERE user_id = v_user_id;

  IF v_alliance_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT array_agg(pb.planet_id) INTO v_result
  FROM planet_buildings pb
  JOIN planets pl ON pl.id = pb.planet_id
  JOIN alliance_members am ON am.user_id = pl.user_id AND am.alliance_id = v_alliance_id
  WHERE pb.planet_id = ANY(p_planet_ids)
    AND pb.building_type_id = 18
    AND pb.level >= 1
    AND pl.user_id != v_user_id;

  RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$$;
