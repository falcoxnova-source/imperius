/*
  # Fix Alliance Member Count Synchronization

  1. Problem
    - When members leave an alliance, the member_count is not decremented
    - This causes the alliance to appear full even when there are available slots

  2. Solution
    - Update the update_alliance_points function to also sync member_count
    - Sync all existing alliance member counts to their correct values

  3. Changes
    - Modified update_alliance_points to recalculate member_count from actual members
    - Fixed all existing alliance member counts
*/

CREATE OR REPLACE FUNCTION update_alliance_points(p_alliance_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_points bigint;
  v_member_count int;
BEGIN
  SELECT 
    COALESCE(SUM(p.points_total), 0),
    COUNT(*)
  INTO v_total_points, v_member_count
  FROM alliance_members am
  JOIN profiles p ON p.id = am.user_id
  WHERE am.alliance_id = p_alliance_id;

  UPDATE alliances
  SET 
    points_total = v_total_points,
    member_count = v_member_count
  WHERE id = p_alliance_id;
END;
$$;

UPDATE alliances a
SET member_count = (
  SELECT COUNT(*) 
  FROM alliance_members 
  WHERE alliance_id = a.id
);
