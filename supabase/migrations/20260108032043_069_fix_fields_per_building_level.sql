/*
  # Fix Planet Fields Calculation (XNova Style)
  
  ## Problem
  In XNova original, each building LEVEL occupies 1 field:
  - Metal Mine level 5 = 5 fields used
  - Crystal Mine level 3 = 3 fields used
  - Total = 8 fields used
  
  The current implementation only counted unique buildings, not total levels.
  
  ## Changes
  1. Fixed complete_building_queue_item to increment fields_used on EVERY level up
  2. Recalculated fields_used for all existing planets based on sum of building levels
  3. Added validation to prevent building when no fields available
  
  ## XNova Original Behavior
  - fields_used = SUM of all building levels on planet
  - fields_max = base planet size + (Terraformer level * 5) for planets
  - Cannot build if fields_used >= fields_max
*/

-- Step 1: Recalculate fields_used for ALL existing planets
UPDATE planets p
SET fields_used = COALESCE(
  (SELECT SUM(pb.level) 
   FROM planet_buildings pb 
   WHERE pb.planet_id = p.id AND pb.level > 0),
  0
);

-- Step 2: Fix the complete_building_queue_item function
-- Now increments fields_used on EVERY level up, not just new buildings
CREATE OR REPLACE FUNCTION complete_building_queue_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue building_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
BEGIN
  -- Get queue item
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  -- Get planet and verify ownership
  SELECT * INTO v_planet FROM planets WHERE id = v_queue.planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- Check if build time is complete
  IF v_queue.end_time IS NULL OR v_queue.end_time > NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Build not complete yet');
  END IF;

  -- Check for existing building
  SELECT * INTO v_existing_building 
  FROM planet_buildings 
  WHERE planet_id = v_queue.planet_id AND building_type_id = v_queue.building_type_id;

  IF FOUND THEN
    -- Calculate levels added (should be 1 for normal upgrades)
    v_levels_added := v_queue.target_level - v_existing_building.level;
    
    -- Update existing building level
    UPDATE planet_buildings 
    SET level = v_queue.target_level, is_upgrading = false, upgrade_end_time = NULL
    WHERE id = v_existing_building.id;
  ELSE
    -- New building - all levels are new
    v_levels_added := v_queue.target_level;
    
    -- Create new building record
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (v_queue.planet_id, v_queue.building_type_id, v_queue.target_level, false);
  END IF;

  -- XNova style: Increment fields_used by number of levels added
  -- Each building level = 1 field used
  IF v_levels_added > 0 THEN
    UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue.planet_id;
  END IF;

  -- Delete the completed queue item
  DELETE FROM building_queue WHERE id = p_queue_id;

  -- Reorder remaining queue items and start next one
  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = v_queue.planet_id
  )
  UPDATE building_queue bq
  SET 
    queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND bq.start_time IS NULL THEN NOW() ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND bq.end_time IS NULL THEN NOW() + (bq.build_time || ' seconds')::interval ELSE bq.end_time END
  FROM reordered r
  WHERE bq.id = r.id;

  RETURN jsonb_build_object('success', true, 'building_type_id', v_queue.building_type_id, 'new_level', v_queue.target_level);
END;
$$;

-- Step 3: Fix the legacy building completion to also update fields
CREATE OR REPLACE FUNCTION process_completed_building_queue(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_queue_item RECORD;
  v_completed_count integer := 0;
  v_result jsonb;
  v_legacy_completed integer := 0;
BEGIN
  -- Verify planet ownership
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- Process all completed queue items in order
  FOR v_queue_item IN 
    SELECT * FROM building_queue 
    WHERE planet_id = p_planet_id 
      AND end_time IS NOT NULL 
      AND end_time <= NOW()
    ORDER BY queue_position
  LOOP
    v_result := complete_building_queue_item(v_queue_item.id);
    IF (v_result->>'success')::boolean THEN
      v_completed_count := v_completed_count + 1;
    END IF;
  END LOOP;

  -- Handle legacy is_upgrading buildings (old system)
  -- Count how many will complete and update fields_used
  SELECT COUNT(*) INTO v_legacy_completed
  FROM planet_buildings
  WHERE planet_id = p_planet_id
    AND is_upgrading = true
    AND upgrade_end_time IS NOT NULL
    AND upgrade_end_time <= NOW();

  IF v_legacy_completed > 0 THEN
    -- Each completed upgrade = 1 more level = 1 more field
    UPDATE planets 
    SET fields_used = fields_used + v_legacy_completed 
    WHERE id = p_planet_id;
    
    -- Complete the buildings
    UPDATE planet_buildings
    SET level = level + 1, is_upgrading = false, upgrade_end_time = NULL
    WHERE planet_id = p_planet_id
      AND is_upgrading = true
      AND upgrade_end_time IS NOT NULL
      AND upgrade_end_time <= NOW();
  END IF;

  RETURN jsonb_build_object('success', true, 'completed_count', v_completed_count + v_legacy_completed);
END;
$$;

-- Step 4: Create function to validate fields before starting construction
CREATE OR REPLACE FUNCTION validate_building_fields(p_planet_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_pending_levels integer;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Count pending levels in queue (each queued item = 1 future level)
  SELECT COALESCE(COUNT(*), 0) INTO v_pending_levels
  FROM building_queue
  WHERE planet_id = p_planet_id;
  
  -- Check if there's room for one more level
  -- fields_used + pending_levels must be less than fields_max
  RETURN (v_planet.fields_used + v_pending_levels) < v_planet.fields_max;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_building_fields(uuid) TO authenticated;

-- Step 5: Add trigger to sync fields when buildings change directly
CREATE OR REPLACE FUNCTION sync_planet_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate fields_used based on actual building levels
  UPDATE planets p
  SET fields_used = COALESCE(
    (SELECT SUM(pb.level) 
     FROM planet_buildings pb 
     WHERE pb.planet_id = p.id AND pb.level > 0),
    0
  )
  WHERE p.id = COALESCE(NEW.planet_id, OLD.planet_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_sync_planet_fields ON planet_buildings;

-- Create trigger for INSERT, UPDATE, DELETE on planet_buildings
CREATE TRIGGER trigger_sync_planet_fields
  AFTER INSERT OR UPDATE OR DELETE ON planet_buildings
  FOR EACH ROW
  EXECUTE FUNCTION sync_planet_fields();
