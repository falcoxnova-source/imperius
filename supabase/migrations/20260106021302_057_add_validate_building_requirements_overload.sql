/*
  # Add validate_building_requirements Overload

  1. Changes
    - Creates an overloaded version of validate_building_requirements with 3 parameters
    - The user_id parameter is ignored since the function already gets it from the planet
    - This fixes secure_add_to_building_queue which calls with 3 parameters

  2. Notes
    - Follows XNova original logic where requirements are validated per planet
    - Does not modify existing 2-parameter function
*/

CREATE OR REPLACE FUNCTION validate_building_requirements(
  p_user_id uuid,
  p_planet_id uuid, 
  p_building_type_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN validate_building_requirements(p_planet_id, p_building_type_id);
END;
$$;

GRANT EXECUTE ON FUNCTION validate_building_requirements(uuid, uuid, integer) TO authenticated;
