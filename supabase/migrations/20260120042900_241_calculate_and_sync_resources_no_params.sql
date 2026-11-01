/*
  # Add parameterless overload for calculate_and_sync_resources

  1. Changes
    - Creates a new overload of calculate_and_sync_resources that takes no parameters
    - Uses auth.uid() to find the user's current/first planet and sync its resources
    
  2. Purpose
    - Allows the frontend to call the function without specifying a planet ID
    - Maintains backward compatibility with existing code
*/

CREATE OR REPLACE FUNCTION calculate_and_sync_resources()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_planet_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  SELECT id INTO v_planet_id
  FROM planets
  WHERE user_id = v_user_id
  ORDER BY is_homeworld DESC, created_at ASC
  LIMIT 1;
  
  IF v_planet_id IS NOT NULL THEN
    PERFORM calculate_and_sync_resources(v_planet_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_and_sync_resources() TO authenticated;
