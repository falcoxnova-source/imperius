/*
  # Fix Function Ambiguity Error

  ## Problem
  PGRST203 error because there are two versions of admin_get_inactive_accounts_detailed:
  - Old: (int, text) 
  - New: (int, text, int, int)

  ## Solution
  Drop the old function signature to remove ambiguity.
*/

-- Drop the old function signature (2 params)
DROP FUNCTION IF EXISTS admin_get_inactive_accounts_detailed(int, text);

-- Ensure we have proper grants on the 4-param version
GRANT EXECUTE ON FUNCTION admin_get_inactive_accounts_detailed(int, text, int, int) TO authenticated;
