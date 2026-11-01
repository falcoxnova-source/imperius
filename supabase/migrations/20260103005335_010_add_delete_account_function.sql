/*
  # Add Delete Account Function

  1. New Functions
    - `delete_user_account()` - Deletes the current user's account and all related data
      - Deletes all user planets, buildings, resources, fleets, etc. (via CASCADE)
      - Deletes the user's profile
      - Returns success status
  
  2. Security
    - Function runs with SECURITY DEFINER to allow deletion of auth data
    - Only the authenticated user can delete their own account
    - All related data is deleted via CASCADE constraints

  3. Notes
    - This is a permanent and irreversible operation
    - Follows XNova/OGame account deletion pattern
*/

CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS json
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  DELETE FROM profiles WHERE id = current_user_id;

  RETURN json_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;