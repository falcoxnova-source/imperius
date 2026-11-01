/*
  # Fix Alliance Points and Ranking System

  ## Problem
  Alliance points_total and rank_position are not being updated when member points change.
  All alliances currently show 0 points and rank 0.

  ## Solution
  1. Create function to update alliance points by summing all member points
  2. Create function to update alliance rankings based on total points
  3. Add trigger to automatically update alliance when user points change
  4. Run initial sync to fix existing data

  ## Functions Created
  - update_alliance_points(alliance_uuid): Updates points_total for a specific alliance
  - update_all_alliance_rankings(): Updates rank_position for all alliances
  - sync_alliance_points_on_profile_change(): Trigger function for automatic updates

  ## Security
  - Functions use SECURITY DEFINER to ensure proper access
  - Search path set to public for security
*/

-- Function to update a single alliance's total points
CREATE OR REPLACE FUNCTION update_alliance_points(p_alliance_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_points bigint;
BEGIN
  SELECT COALESCE(SUM(p.points_total), 0)
  INTO v_total_points
  FROM alliance_members am
  JOIN profiles p ON p.id = am.user_id
  WHERE am.alliance_id = p_alliance_id;

  UPDATE alliances
  SET points_total = v_total_points
  WHERE id = p_alliance_id;
END;
$$;

-- Function to update all alliance rankings
CREATE OR REPLACE FUNCTION update_all_alliance_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ranked_alliances AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (ORDER BY points_total DESC, created_at ASC) as new_rank
    FROM alliances
  )
  UPDATE alliances a
  SET rank_position = ra.new_rank
  FROM ranked_alliances ra
  WHERE a.id = ra.id;
END;
$$;

-- Function to update all alliance points and rankings (for batch updates)
CREATE OR REPLACE FUNCTION update_all_alliance_points_and_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update all alliance points
  UPDATE alliances a
  SET points_total = (
    SELECT COALESCE(SUM(p.points_total), 0)
    FROM alliance_members am
    JOIN profiles p ON p.id = am.user_id
    WHERE am.alliance_id = a.id
  );

  -- Update all rankings
  PERFORM update_all_alliance_rankings();
END;
$$;

-- Trigger function to sync alliance points when profile points change
CREATE OR REPLACE FUNCTION sync_alliance_points_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alliance_id uuid;
BEGIN
  -- Find if user is in an alliance
  SELECT alliance_id INTO v_alliance_id
  FROM alliance_members
  WHERE user_id = NEW.id;

  -- If user is in an alliance, update its points
  IF v_alliance_id IS NOT NULL THEN
    PERFORM update_alliance_points(v_alliance_id);
    PERFORM update_all_alliance_rankings();
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_sync_alliance_points ON profiles;

-- Create trigger on profiles table
CREATE TRIGGER trigger_sync_alliance_points
  AFTER UPDATE OF points_total ON profiles
  FOR EACH ROW
  WHEN (OLD.points_total IS DISTINCT FROM NEW.points_total)
  EXECUTE FUNCTION sync_alliance_points_on_profile_change();

-- Trigger function to update alliance points when member joins or leaves
CREATE OR REPLACE FUNCTION sync_alliance_on_member_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM update_alliance_points(NEW.alliance_id);
    PERFORM update_all_alliance_rankings();
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_alliance_points(OLD.alliance_id);
    PERFORM update_all_alliance_rankings();
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_sync_alliance_on_member_change ON alliance_members;

-- Create trigger on alliance_members table
CREATE TRIGGER trigger_sync_alliance_on_member_change
  AFTER INSERT OR DELETE ON alliance_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_alliance_on_member_change();

-- Run initial sync to fix all existing data
SELECT update_all_alliance_points_and_rankings();
