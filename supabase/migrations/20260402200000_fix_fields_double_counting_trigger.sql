/*
  # Fix Moon/Planet Fields Double-Counting Bug

  ## Root Cause
  The trigger `trigger_sync_planet_fields` (on planet_buildings) recalculates
  `fields_used = SUM(level)` on every INSERT/UPDATE/DELETE.
  
  Then `complete_building_queue_item` and `process_building_queue_internal` 
  ALSO do `fields_used = fields_used + v_levels_added` AFTER the trigger.
  
  Result: every build overcounts fields_used by +1.
  Similarly, `secure_demolish_building` does `fields_used -= 1` after the trigger,
  undercounting by 1 on demolish.

  ## Impact
  - 2,587 of 2,932 planets overcounted by +1
  - 49 of 86 moons overcounted by +1
  - 2 moons with wrong fields_max (Lunar Base didn't increase max)

  ## Fix
  1. Drop trigger_sync_planet_fields (eliminates double-counting)
  2. Correct fields_used = SUM(level) for ALL planets and moons
  3. Correct fields_max = 1 + (lunar_base_level * 3) for ALL moons
*/

-- ==========================================================================
-- STEP 1: Drop the conflicting trigger
-- ==========================================================================
DROP TRIGGER IF EXISTS trigger_sync_planet_fields ON planet_buildings;

-- Keep the function for reference but it's no longer called
-- DROP FUNCTION IF EXISTS sync_planet_fields();

-- ==========================================================================
-- STEP 2: Fix fields_used for ALL planets AND moons
-- ==========================================================================
UPDATE planets p
SET fields_used = COALESCE(
  (SELECT SUM(pb.level) 
   FROM planet_buildings pb 
   WHERE pb.planet_id = p.id AND pb.level > 0),
  0
);

-- ==========================================================================
-- STEP 3: Fix fields_max for ALL moons
-- ==========================================================================
UPDATE planets p
SET fields_max = 1 + COALESCE(
  (SELECT pb.level * 3
   FROM planet_buildings pb
   JOIN building_types bt ON bt.id = pb.building_type_id
   WHERE pb.planet_id = p.id AND bt.code = 'lunar_base'),
  0
)
WHERE p.planet_type = 'moon';
