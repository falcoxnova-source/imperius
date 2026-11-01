/*
  # Add check_bashing_rule alias function
  
  1. Changes
    - Creates check_bashing_rule as alias for check_bashing_limit
    - Fixes error when validate_fleet_mission calls wrong function name
*/

CREATE OR REPLACE FUNCTION check_bashing_rule(
  p_attacker_id uuid,
  p_defender_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN check_bashing_limit(p_attacker_id, p_defender_id);
END;
$$;