/*
  # Grant Execute Permissions for Plus Functions
  
  1. Changes
    - Add GRANT EXECUTE for calculate_expired_plus_rewards
    - Add GRANT EXECUTE for get_my_pending_plus_rewards
    
  2. Notes
    - These functions were missing grants in migration 232
    - get_my_pending_plus_rewards allows users to see their pending rewards
    - calculate_expired_plus_rewards is called internally but needs grant for direct calls
*/

GRANT EXECUTE ON FUNCTION calculate_expired_plus_rewards() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_pending_plus_rewards() TO authenticated;
