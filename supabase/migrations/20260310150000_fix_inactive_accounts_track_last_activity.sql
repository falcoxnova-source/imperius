/*
  # Fix: Track player last_activity for inactive accounts detection

  ## Problem
  The column profiles.last_activity was never updated after account creation,
  so ALL players with accounts older than 7 days appeared as "inactive" in
  the admin panel, even if they play every day.

  ## Solution (minimal, zero deadlock risk)
  1. Add `last_activity = now()` to the existing UPDATE in update_player_points()
     This function already runs on every game action (build, research, fleet, ships)
     so it captures all real activity without adding new triggers or transactions.

  2. Create a small RPC update_player_activity() for the frontend to call on
     login/session load, capturing passive sessions where the player only looks.

  3. Backfill last_activity for existing active players using their most recent
     game action timestamps, so the admin panel is accurate immediately.
*/

-- ==========================================================================
-- 1. Add last_activity = now() to update_player_points (existing function)
--    This is the SAME function, just adding one column to the UPDATE it
--    already does on profiles.
-- ==========================================================================
CREATE OR REPLACE FUNCTION update_player_points(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '15s'
SET lock_timeout TO '10s'
AS $$
DECLARE
  v_buildings integer;
  v_research integer;
  v_fleet integer;
  v_defense integer;
BEGIN
  v_buildings := calculate_building_points(p_user_id);
  v_research := calculate_research_points(p_user_id);
  v_fleet := calculate_fleet_points(p_user_id);
  v_defense := calculate_defense_points(p_user_id);

  UPDATE profiles SET
    points_buildings = v_buildings,
    points_research = v_research,
    points_fleet = v_fleet,
    points_defense = v_defense,
    points_total = v_buildings + v_research + v_fleet + v_defense,
    updated_at = now(),
    last_activity = now()
  WHERE id = p_user_id;
END;
$$;

-- ==========================================================================
-- 2. RPC for frontend to call on login/session load
-- ==========================================================================
CREATE OR REPLACE FUNCTION update_player_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE profiles
  SET last_activity = now()
  WHERE id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_player_activity() TO authenticated;

-- ==========================================================================
-- 3. Backfill last_activity for existing players based on real game data
--    so the admin panel shows correct info immediately after migration
-- ==========================================================================
UPDATE profiles p
SET last_activity = GREATEST(
  p.last_activity,
  COALESCE((SELECT MAX(f.departure_time) FROM fleets f WHERE f.user_id = p.id), p.created_at),
  COALESCE((SELECT MAX(bq.created_at) FROM building_queue bq JOIN planets pl ON bq.planet_id = pl.id WHERE pl.user_id = p.id), p.created_at),
  COALESCE((SELECT MAX(ut.created_at) FROM user_technologies ut WHERE ut.user_id = p.id), p.created_at)
)
WHERE COALESCE(p.is_admin, false) = false;
