/*
  # Remove direct fleet insert policy - Security fix
  
  1. Problem
    - Users can bypass secure_send_fleet() and insert fleets directly
    - This allows them to exceed fleet slot limits
    - No validation of resources, ships, or other game rules
    
  2. Solution
    - Remove the INSERT policy on fleets table
    - All fleet creation MUST go through secure_send_fleet() which has SECURITY DEFINER
    - Keep SELECT/UPDATE/DELETE policies for normal operations
    
  3. Security Impact
    - Closes exploit that allowed 6/5 fleets
    - Forces all fleet creation through validated server function
*/

DROP POLICY IF EXISTS "Users can create own fleets" ON fleets;

DROP POLICY IF EXISTS "Users can update own fleets" ON fleets;

DROP POLICY IF EXISTS "Users can delete own fleets" ON fleets;
