/*
  # Administrative Maintenance Functions for Stuck Queues

  This migration creates administrative functions to:
  1. Process ALL stuck building queues regardless of user session
  2. Process ALL stuck shipyard queues regardless of user session
  3. Process ALL stuck fleets regardless of user session
  4. Create a master maintenance function for admins

  These functions use SECURITY DEFINER to bypass RLS and process
  all stuck items across the entire game.

  ## Functions Created:
  - admin_process_stuck_building_queues(): Process all expired building queues
  - admin_process_stuck_shipyard_queues(): Process all expired shipyard queues
  - admin_process_stuck_fleets(): Process all expired fleets
  - admin_run_full_maintenance(): Run all maintenance tasks at once

  ## Security:
  - All functions require admin role check
  - Uses SECURITY DEFINER for RLS bypass
*/

-- Function to process ALL stuck building queues (admin only)
CREATE OR REPLACE FUNCTION admin_process_stuck_building_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_queue_item RECORD;
  v_completed_count integer := 0;
  v_error_count integer := 0;
  v_building_record RECORD;
  v_planet RECORD;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NOT NULL THEN
    SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  FOR v_queue_item IN 
    SELECT bq.*, bt.code as building_code
    FROM building_queue bq
    JOIN building_types bt ON bq.building_type_id = bt.id
    WHERE bq.end_time IS NOT NULL 
      AND bq.end_time <= NOW()
    ORDER BY bq.end_time ASC
  LOOP
    BEGIN
      SELECT * INTO v_planet FROM planets WHERE id = v_queue_item.planet_id;
      
      SELECT * INTO v_building_record 
      FROM planet_buildings 
      WHERE planet_id = v_queue_item.planet_id 
        AND building_type_id = v_queue_item.building_type_id;
      
      IF v_building_record IS NOT NULL THEN
        UPDATE planet_buildings
        SET level = v_queue_item.target_level,
            is_upgrading = false,
            upgrade_end_time = NULL
        WHERE id = v_building_record.id;
      ELSE
        INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
        VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false);
      END IF;
      
      UPDATE planets
      SET fields_used = fields_used + 1
      WHERE id = v_queue_item.planet_id
        AND fields_used < fields_max;
      
      DELETE FROM building_queue WHERE id = v_queue_item.id;
      
      UPDATE building_queue
      SET queue_position = queue_position - 1
      WHERE planet_id = v_queue_item.planet_id
        AND queue_position > v_queue_item.queue_position;
      
      v_completed_count := v_completed_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  FOR v_queue_item IN 
    SELECT bq.*, bt.code as building_code, p.user_id
    FROM building_queue bq
    JOIN building_types bt ON bq.building_type_id = bt.id
    JOIN planets p ON bq.planet_id = p.id
    WHERE bq.queue_position = 1 
      AND bq.end_time IS NULL
  LOOP
    BEGIN
      PERFORM secure_activate_building_queue(v_queue_item.planet_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'completed_count', v_completed_count,
    'error_count', v_error_count
  );
END;
$$;

-- Function to process ALL stuck shipyard queues (admin only)
CREATE OR REPLACE FUNCTION admin_process_stuck_shipyard_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_queue_item RECORD;
  v_completed_units integer := 0;
  v_error_count integer := 0;
  v_units_to_complete integer;
  v_planet RECORD;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NOT NULL THEN
    SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  FOR v_queue_item IN 
    SELECT sq.*, p.user_id
    FROM shipyard_queue sq
    JOIN planets p ON sq.planet_id = p.id
    WHERE sq.current_unit_end_time IS NOT NULL 
      AND sq.current_unit_end_time <= NOW()
    ORDER BY sq.current_unit_end_time ASC
  LOOP
    BEGIN
      v_units_to_complete := v_queue_item.quantity - v_queue_item.quantity_completed;
      
      IF v_queue_item.item_type = 'ship' AND v_queue_item.ship_type_id IS NOT NULL THEN
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES (v_queue_item.planet_id, v_queue_item.ship_type_id, v_units_to_complete)
        ON CONFLICT (planet_id, ship_type_id)
        DO UPDATE SET quantity = planet_ships.quantity + v_units_to_complete;
      ELSIF v_queue_item.item_type = 'defense' AND v_queue_item.defense_type_id IS NOT NULL THEN
        INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
        VALUES (v_queue_item.planet_id, v_queue_item.defense_type_id, v_units_to_complete)
        ON CONFLICT (planet_id, defense_type_id)
        DO UPDATE SET quantity = planet_defenses.quantity + v_units_to_complete;
      END IF;
      
      DELETE FROM shipyard_queue WHERE id = v_queue_item.id;
      
      UPDATE shipyard_queue
      SET queue_position = queue_position - 1
      WHERE planet_id = v_queue_item.planet_id
        AND queue_position > v_queue_item.queue_position;
      
      v_completed_units := v_completed_units + v_units_to_complete;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  UPDATE shipyard_queue sq
  SET start_time = NOW(),
      current_unit_end_time = NOW() + (sq.build_time_per_unit * INTERVAL '1 second')
  WHERE sq.queue_position = 1
    AND sq.start_time IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'completed_units', v_completed_units,
    'error_count', v_error_count
  );
END;
$$;

-- Function to process ALL stuck fleets (admin only)
CREATE OR REPLACE FUNCTION admin_process_stuck_fleets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_fleet RECORD;
  v_processed_count integer := 0;
  v_error_count integer := 0;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NOT NULL THEN
    SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  FOR v_fleet IN 
    SELECT f.*
    FROM fleets f
    WHERE f.is_completed = false
      AND f.arrival_time IS NOT NULL
      AND f.arrival_time <= NOW()
    ORDER BY f.arrival_time ASC
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      UPDATE fleets 
      SET is_completed = true
      WHERE id = v_fleet.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count,
    'error_count', v_error_count
  );
END;
$$;

-- Function to process ALL stuck research (admin only)
CREATE OR REPLACE FUNCTION admin_process_stuck_research()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_tech RECORD;
  v_completed_count integer := 0;
  v_error_count integer := 0;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NOT NULL THEN
    SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  FOR v_tech IN 
    SELECT ut.*
    FROM user_technologies ut
    WHERE ut.is_researching = true
      AND ut.research_end_time IS NOT NULL
      AND ut.research_end_time <= NOW()
    ORDER BY ut.research_end_time ASC
  LOOP
    BEGIN
      UPDATE user_technologies
      SET level = level + 1,
          is_researching = false,
          research_end_time = NULL,
          research_planet_id = NULL
      WHERE id = v_tech.id;
      
      PERFORM update_user_points(v_tech.user_id);
      
      v_completed_count := v_completed_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'completed_count', v_completed_count,
    'error_count', v_error_count
  );
END;
$$;

-- Master maintenance function that runs all cleanup tasks
CREATE OR REPLACE FUNCTION admin_run_full_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_buildings_result jsonb;
  v_shipyard_result jsonb;
  v_fleets_result jsonb;
  v_research_result jsonb;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NOT NULL THEN
    SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  SELECT admin_process_stuck_building_queues() INTO v_buildings_result;
  SELECT admin_process_stuck_shipyard_queues() INTO v_shipyard_result;
  SELECT admin_process_stuck_fleets() INTO v_fleets_result;
  SELECT admin_process_stuck_research() INTO v_research_result;

  RETURN jsonb_build_object(
    'success', true,
    'buildings', v_buildings_result,
    'shipyard', v_shipyard_result,
    'fleets', v_fleets_result,
    'research', v_research_result,
    'executed_at', NOW()
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION admin_process_stuck_building_queues() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_process_stuck_shipyard_queues() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_process_stuck_fleets() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_process_stuck_research() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_run_full_maintenance() TO authenticated;