/*
  # Fix fleet acceleration timeout with combined ship types

  ## Problem
  When accelerating a fleet with multiple ship types, process_fleet_arrival()
  modifies fleet_ships, planet_ships, planet_defenses, planet_buildings, fleets.
  Each row change fires per-row triggers that call update_player_points()
  (4 aggregate queries + 1 profile update) PER ROW.

  With 5-6 ship types in an attack: ~27 trigger fires × 5 DB operations
  inside one transaction → exceeds statement timeout → "Error de conexión".

  Single ship type works fine. Combined fleets timeout.

  ## Fix
  Disable all 5 per-row point triggers during process_fleet_arrival(),
  then recalculate points once for attacker and defender.
  Same pattern used by optimized_global_queue_processor.

  ## Scope
  Only patches accelerate_fleet. No schema, table, or other function changes.
*/

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'accelerate_fleet'
    AND pronargs = 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'accelerate_fleet not found, skipping';
    RETURN;
  END IF;

  -- Anchor: the unique PERFORM process_fleet_arrival call
  v_src := replace(v_src,
    'PERFORM process_fleet_arrival(p_fleet_id);',
    '-- Disable per-row point triggers to prevent timeout with multiple ship types' || chr(10) ||
    'ALTER TABLE fleet_ships DISABLE TRIGGER trigger_fleet_ships_change_points;' || chr(10) ||
    'ALTER TABLE fleets DISABLE TRIGGER trigger_fleet_change_points;' || chr(10) ||
    'ALTER TABLE planet_ships DISABLE TRIGGER trigger_fleet_points;' || chr(10) ||
    'ALTER TABLE planet_defenses DISABLE TRIGGER trigger_defense_points;' || chr(10) ||
    'ALTER TABLE planet_buildings DISABLE TRIGGER trigger_building_points;' || chr(10) || chr(10) ||
    'PERFORM process_fleet_arrival(p_fleet_id);' || chr(10) || chr(10) ||
    '-- Re-enable all triggers' || chr(10) ||
    'ALTER TABLE fleet_ships ENABLE TRIGGER trigger_fleet_ships_change_points;' || chr(10) ||
    'ALTER TABLE fleets ENABLE TRIGGER trigger_fleet_change_points;' || chr(10) ||
    'ALTER TABLE planet_ships ENABLE TRIGGER trigger_fleet_points;' || chr(10) ||
    'ALTER TABLE planet_defenses ENABLE TRIGGER trigger_defense_points;' || chr(10) ||
    'ALTER TABLE planet_buildings ENABLE TRIGGER trigger_building_points;' || chr(10) || chr(10) ||
    '-- Recalculate points once for attacker and defender' || chr(10) ||
    'PERFORM update_player_points(v_user_id);' || chr(10) ||
    'IF v_defender_id IS NOT NULL THEN' || chr(10) ||
    '  PERFORM update_player_points(v_defender_id);' || chr(10) ||
    'END IF;');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION accelerate_fleet(p_fleet_id uuid) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = public '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'accelerate_fleet: all point triggers disabled during fleet processing';
END $$;
