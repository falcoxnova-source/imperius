/*
  # Remove All Colonies - Keep Only Homeworld

  This migration removes all colonies from players, keeping only their main planet (homeworld).
  Players will need to colonize again to expand.

  ## What This Does:
  1. Identifies all colonies (is_main_planet = false)
  2. Cancels any fleets originating from colonies
  3. Removes all data associated with colonies:
     - Planet resources
     - Buildings
     - Ships on planet
     - Defenses
     - Building queues
     - Shipyard queues
  4. Deletes the colony planets themselves

  ## Why:
  - Having colonies from before server reset gives unfair advantage
  - Players should progress naturally and colonize again

  ## Stats Before Reset:
  - Main planets: 97
  - Colonies to remove: 33
*/

-- Step 1: Delete fleets that originate from colonies
DELETE FROM fleets
WHERE origin_planet_id IN (
  SELECT id FROM planets 
  WHERE is_main_planet = false 
  AND planet_type = 'planet'
  AND user_id IS NOT NULL
);

-- Step 2: Delete building queues for colonies
DELETE FROM building_queue
WHERE planet_id IN (
  SELECT id FROM planets 
  WHERE is_main_planet = false 
  AND planet_type = 'planet'
  AND user_id IS NOT NULL
);

-- Step 3: Delete shipyard queues for colonies
DELETE FROM shipyard_queue
WHERE planet_id IN (
  SELECT id FROM planets 
  WHERE is_main_planet = false 
  AND planet_type = 'planet'
  AND user_id IS NOT NULL
);

-- Step 4: Delete planet defenses for colonies
DELETE FROM planet_defenses
WHERE planet_id IN (
  SELECT id FROM planets 
  WHERE is_main_planet = false 
  AND planet_type = 'planet'
  AND user_id IS NOT NULL
);

-- Step 5: Delete planet ships for colonies
DELETE FROM planet_ships
WHERE planet_id IN (
  SELECT id FROM planets 
  WHERE is_main_planet = false 
  AND planet_type = 'planet'
  AND user_id IS NOT NULL
);

-- Step 6: Delete planet buildings for colonies
DELETE FROM planet_buildings
WHERE planet_id IN (
  SELECT id FROM planets 
  WHERE is_main_planet = false 
  AND planet_type = 'planet'
  AND user_id IS NOT NULL
);

-- Step 7: Delete planet resources for colonies
DELETE FROM planet_resources
WHERE planet_id IN (
  SELECT id FROM planets 
  WHERE is_main_planet = false 
  AND planet_type = 'planet'
  AND user_id IS NOT NULL
);

-- Step 8: Finally, delete the colony planets themselves
DELETE FROM planets
WHERE is_main_planet = false 
AND planet_type = 'planet'
AND user_id IS NOT NULL;

-- Verify the cleanup
DO $$
DECLARE
  remaining_colonies integer;
  main_planets integer;
BEGIN
  SELECT COUNT(*) INTO remaining_colonies 
  FROM planets 
  WHERE is_main_planet = false AND planet_type = 'planet' AND user_id IS NOT NULL;
  
  SELECT COUNT(*) INTO main_planets 
  FROM planets 
  WHERE is_main_planet = true AND planet_type = 'planet' AND user_id IS NOT NULL;
  
  RAISE NOTICE 'Cleanup complete. Main planets: %, Remaining colonies: %', main_planets, remaining_colonies;
END $$;
