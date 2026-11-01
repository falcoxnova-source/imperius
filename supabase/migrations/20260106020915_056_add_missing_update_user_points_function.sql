/*
  # Add Missing update_user_points Function

  1. Changes
    - Creates update_user_points as an alias for update_player_points
    - This fixes the complete_research function that was calling a non-existent function

  2. Notes
    - This is a simple alias to maintain compatibility
    - Does not modify any existing functionality
*/

-- Create alias function for update_user_points
CREATE OR REPLACE FUNCTION update_user_points(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM update_player_points(p_user_id);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION update_user_points(uuid) TO authenticated;
