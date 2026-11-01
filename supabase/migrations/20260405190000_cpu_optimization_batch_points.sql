-- ============================================================================
-- CPU OPTIMIZATION: Point triggers → batch queue + pg_cron
-- ============================================================================
-- PROBLEM: 7 point triggers fire on every row change, each calling 
-- update_player_points (4 heavy calculate functions + profiles UPDATE)
-- which cascades to alliance points + all alliance rankings.
-- A single fleet send with 10 ship types fires 10+ trigger cascades.
--
-- SOLUTION: Replace heavy per-row triggers with lightweight queue inserts.
-- pg_cron batch processes the queue every 2 minutes.
-- ============================================================================

-- 1. Create lightweight points update queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS points_update_queue (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant access
ALTER TABLE points_update_queue ENABLE ROW LEVEL SECURITY;
GRANT ALL ON points_update_queue TO postgres;
GRANT ALL ON points_update_queue TO service_role;

-- 2. Create lightweight trigger function that just queues user_id
-- ============================================================================
CREATE OR REPLACE FUNCTION queue_points_update_for_planet_table()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = OLD.planet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = NEW.planet_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.points_update_queue (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION queue_points_update_for_user_table()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.points_update_queue (user_id)
  VALUES (CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION queue_points_update_for_fleet_ships()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Skip when called inside secure_send_fleet (points calculated once at end)
  IF current_setting('app.skip_point_triggers', true) = 'true' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM public.fleets WHERE id = OLD.fleet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM public.fleets WHERE id = NEW.fleet_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.points_update_queue (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION queue_points_update_for_fleet()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip when called inside secure_send_fleet (points calculated once at end)
  IF current_setting('app.skip_point_triggers', true) = 'true' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.points_update_queue (user_id)
  VALUES (CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- 3. Drop old heavy triggers and create lightweight replacements
-- ============================================================================

-- planet_buildings: was calling full update_player_points(4 calculations)
DROP TRIGGER IF EXISTS trigger_building_points ON planet_buildings;
CREATE TRIGGER trigger_building_points
  AFTER INSERT OR UPDATE OR DELETE ON planet_buildings
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_planet_table();

-- planet_defenses: was calling full update_player_points(4 calculations)
DROP TRIGGER IF EXISTS trigger_defense_points ON planet_defenses;
CREATE TRIGGER trigger_defense_points
  AFTER INSERT OR UPDATE OR DELETE ON planet_defenses
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_planet_table();

-- planet_ships: was calling full update_player_points(4 calculations)
DROP TRIGGER IF EXISTS trigger_fleet_points ON planet_ships;
CREATE TRIGGER trigger_fleet_points
  AFTER INSERT OR UPDATE OR DELETE ON planet_ships
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_planet_table();

-- user_technologies: was calling full update_player_points(4 calculations)
DROP TRIGGER IF EXISTS trigger_research_points ON user_technologies;
CREATE TRIGGER trigger_research_points
  AFTER INSERT OR UPDATE OR DELETE ON user_technologies
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_user_table();

-- fleets: was calling update_user_points → update_player_points(4 calculations)
DROP TRIGGER IF EXISTS trigger_fleet_change_points ON fleets;
CREATE TRIGGER trigger_fleet_change_points
  AFTER INSERT OR UPDATE OR DELETE ON fleets
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_fleet();

-- fleet_ships: was calling update_user_points → update_player_points(4 calculations)
DROP TRIGGER IF EXISTS trigger_fleet_ships_change_points ON fleet_ships;
CREATE TRIGGER trigger_fleet_ships_change_points
  AFTER INSERT OR UPDATE OR DELETE ON fleet_ships
  FOR EACH ROW EXECUTE FUNCTION queue_points_update_for_fleet_ships();

-- 4. Create batch processing function
-- ============================================================================
CREATE OR REPLACE FUNCTION batch_update_player_points()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_user_id UUID;
  v_buildings INTEGER;
  v_research INTEGER;
  v_fleet INTEGER;
  v_defense INTEGER;
BEGIN
  -- Process all queued users in one batch
  FOR v_user_id IN
    DELETE FROM points_update_queue
    RETURNING user_id
  LOOP
    -- Calculate all 4 categories once per user
    v_buildings := calculate_building_points(v_user_id);
    v_research := calculate_research_points(v_user_id);
    v_fleet := calculate_fleet_points(v_user_id);
    v_defense := calculate_defense_points(v_user_id);

    UPDATE profiles SET
      points_buildings = v_buildings,
      points_research = v_research,
      points_fleet = v_fleet,
      points_defense = v_defense,
      points_total = v_buildings + v_research + v_fleet + v_defense
    WHERE id = v_user_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- 5. Optimize alliance sync trigger: remove redundant update_all_alliance_rankings
-- (already runs every 10 min via pg_cron job 'update_rankings_10m')
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_alliance_points_on_profile_change()
RETURNS TRIGGER AS $$
DECLARE
  v_alliance_id uuid;
BEGIN
  -- Only sync alliance when points actually changed
  IF OLD.points_total IS DISTINCT FROM NEW.points_total THEN
    SELECT alliance_id INTO v_alliance_id
    FROM alliance_members
    WHERE user_id = NEW.id;

    IF v_alliance_id IS NOT NULL THEN
      PERFORM update_alliance_points(v_alliance_id);
      -- NOTE: update_all_alliance_rankings() removed - already runs via
      -- pg_cron job 'update_rankings_10m' every 10 minutes
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- 6. Schedule batch points processing every 2 minutes via pg_cron
-- ============================================================================
SELECT cron.schedule(
  'batch-update-points',
  '*/2 * * * *',
  $$SELECT batch_update_player_points()$$
);

-- 7. Schedule cleanup of _http_response table (367MB of accumulated webhook garbage)
-- Run daily at 4 AM, keep only last 24 hours
-- ============================================================================
SELECT cron.schedule(
  'cleanup-http-response',
  '0 4 * * *',
  $$DELETE FROM net._http_response WHERE created < now() - interval '24 hours'$$
);

-- 8. Schedule cleanup of old completed fleets (241K completed, only 302 active)
-- Run weekly on Sunday at 5 AM, keep last 30 days
-- ============================================================================
SELECT cron.schedule(
  'cleanup-old-completed-fleets',
  '0 5 * * 0',
  $$DELETE FROM fleets WHERE is_completed = true AND arrival_time < now() - interval '30 days'$$
);

-- 9. Do initial cleanup of _http_response (free up 367MB immediately)
-- ============================================================================
DELETE FROM net._http_response WHERE created < now() - interval '24 hours';

-- 10. Add index on fleet_ships.fleet_id for faster lookups in calculate_fleet_points
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_fleet_ships_fleet_id ON fleet_ships(fleet_id);
