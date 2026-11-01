/*
  # Remove 3 Excess Colonies from Moscow Account

  Admin action to correct a race condition exploit that allowed user "Moscow" 
  (id: 7c195ebb-45f2-47ec-8647-6a102db7f685) to create 12 planets with 
  Astrophysics level 1 (max should be 2).

  Removing the 3 least powerful colonies (by building levels, ships, defenses):
  
  1. Planet 3:322:9 (id: 51de7d54-83ae-425b-a906-5feabda67cf1) - 21 fields, 0 ships, 0 defenses
  2. Planet 5:125:9 (id: d9304dd3-ed6c-4e1b-93ad-e8f1ebf7a80d) - 23 fields, 0 ships, 0 defenses
  3. Planet 5:301:9 (id: e23f2d60-07d8-42a1-a37e-4692a46cfa36) - 23 fields, 0 ships, 0 defenses

  All 3 planets verified: no active fleets, no building queues, no shipyard queues.
  Result: Moscow goes from 12 planets to 9.
*/

DO $$
DECLARE
  v_planet_ids uuid[] := ARRAY[
    '51de7d54-83ae-425b-a906-5feabda67cf1',
    'd9304dd3-ed6c-4e1b-93ad-e8f1ebf7a80d',
    'e23f2d60-07d8-42a1-a37e-4692a46cfa36'
  ];
  v_pid uuid;
BEGIN
  FOREACH v_pid IN ARRAY v_planet_ids
  LOOP
    DELETE FROM planet_defenses WHERE planet_id = v_pid;
    DELETE FROM planet_ships WHERE planet_id = v_pid;
    DELETE FROM planet_buildings WHERE planet_id = v_pid;
    DELETE FROM planet_resources WHERE planet_id = v_pid;
    DELETE FROM building_queue WHERE planet_id = v_pid;
    DELETE FROM shipyard_queue WHERE planet_id = v_pid;
    DELETE FROM planets WHERE id = v_pid AND user_id = '7c195ebb-45f2-47ec-8647-6a102db7f685' AND is_main_planet = false;
  END LOOP;
END $$;
