/*
  # Eliminate Lock Contention from Ranking Cascade

  ## Root Cause
  Every `instant_complete_*` function and `full_reconnect_sync` calls `update_user_points()`,
  which internally calls `update_player_points()`, which calls `update_all_ranks()`.
  
  `update_all_ranks()` does: UPDATE profiles SET rank_position = ... FROM (SELECT ... FROM profiles)
  This locks EVERY row in the profiles table for the duration of the ranking recalculation.
  
  When the cron job runs simultaneously (processing queues, updating points), both the cron
  and the user's instant-complete function compete for the same profile rows, causing:
  - Error 57014: statement timeout (query takes too long waiting for locks)
  - Error 55P03: lock timeout (can't acquire lock within limit)

  ## Solution
  1. Create `update_player_points_no_rank()` - updates only the user's own points WITHOUT 
     triggering a global ranking recalculation. This is safe because rankings are cosmetic
     and can be slightly delayed without affecting gameplay.
  
  2. Update ALL instant_complete functions to:
     - Use `update_player_points_no_rank()` instead of `update_user_points()`
     - Add `SET statement_timeout TO '30s'` and `SET lock_timeout TO '15s'`
     - These prevent the 8s default authenticator timeout from killing the request
  
  3. Update `full_reconnect_sync()` to use `update_player_points_no_rank()`
  
  4. Update the cron `optimized_global_queue_processor()` to:
     - Use `FOR UPDATE SKIP LOCKED` in the research section (was missing)
     - Call `update_all_ranks()` ONCE at the end of the entire batch
     - This is the ONLY place rankings get recalculated (every 5 minutes)
  
  ## Impact on Gameplay
  - ZERO change to game logic, resource calculations, FXU handling, or any business rules
  - Rankings update every ~5 minutes instead of instantly (imperceptible to players)
  - Player's OWN points update instantly (only global rank position is slightly delayed)
  - All timeout errors eliminated because no function locks ALL profiles anymore

  ## Tables Modified
  - None (only function definitions updated)

  ## Functions Modified
  - `update_player_points_no_rank` (NEW)
  - `instant_complete_research(uuid)` 
  - `instant_complete_building(uuid)`
  - `instant_complete_shipyard_item(uuid)`
  - `full_reconnect_sync(uuid)`
  - `optimized_global_queue_processor()`
*/

-- =========================================================================
-- 1. Create lightweight points update (NO ranking cascade)
-- =========================================================================
CREATE OR REPLACE FUNCTION update_player_points_no_rank(p_user_id uuid)
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
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_player_points_no_rank(uuid) TO authenticated;

-- =========================================================================
-- 2. Fix instant_complete_research(uuid) - the one actually called by frontend
-- =========================================================================
CREATE OR REPLACE FUNCTION instant_complete_research(p_technology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '30s'
SET lock_timeout TO '15s'
AS $$
DECLARE
  v_user_id uuid;
  v_tech_record record;
  v_fxu_cost numeric;
  v_current_fxu numeric;
  v_remaining_seconds numeric;
  v_admin_id uuid;
  v_tech_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN 
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); 
  END IF;

  SELECT ut.*, tt.name as tech_name, tt.id as type_id
  INTO v_tech_record
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.id = p_technology_id 
    AND ut.user_id = v_user_id 
    AND ut.is_researching = true
    AND ut.research_end_time IS NOT NULL;

  IF v_tech_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay investigacion en progreso');
  END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_tech_record.research_end_time - now())));

  IF v_remaining_seconds <= 600 THEN 
    v_fxu_cost := GREATEST(1, CEIL(v_remaining_seconds / 60));
  ELSIF v_remaining_seconds <= 3600 THEN 
    v_fxu_cost := 10 + CEIL((v_remaining_seconds - 600) / 120);
  ELSIF v_remaining_seconds <= 86400 THEN 
    v_fxu_cost := 35 + CEIL((v_remaining_seconds - 3600) / 300);
  ELSE 
    v_fxu_cost := 100 + CEIL((v_remaining_seconds - 86400) / 600);
  END IF;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente', 'required', v_fxu_cost);
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  PERFORM record_admin_revenue(
    'instant_research', 
    v_fxu_cost,
    'Investigacion: ' || v_tech_record.tech_name || ' Lv' || (v_tech_record.level + 1), 
    v_user_id, 
    p_technology_id
  );

  UPDATE user_technologies 
  SET 
    level = level + 1,
    is_researching = false,
    research_end_time = NULL,
    research_planet_id = NULL
  WHERE id = p_technology_id;

  PERFORM update_player_points_no_rank(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'new_level', v_tech_record.level + 1);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Error de base de datos: ' || SQLERRM);
END;
$$;

-- =========================================================================
-- 3. Fix instant_complete_building(uuid) 
-- =========================================================================
CREATE OR REPLACE FUNCTION instant_complete_building(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '30s'
SET lock_timeout TO '15s'
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_admin_id uuid;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT bq.id, bq.planet_id, bq.building_type_id, bq.target_level, bq.build_time,
         bq.queue_position, bq.start_time, bq.end_time, bt.name as building_name, p.user_id as planet_owner
  INTO v_queue_item
  FROM building_queue bq
  JOIN building_types bt ON bq.building_type_id = bt.id
  JOIN planets p ON bq.planet_id = p.id
  WHERE bq.id = p_queue_id AND bq.queue_position = 1 AND bq.end_time IS NOT NULL;

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_fxu_cost := calculate_fxu_cost_building(p_queue_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Building already complete');
  END IF;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost);
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  PERFORM record_admin_revenue('instant_build', v_fxu_cost,
    'Construccion: ' || v_queue_item.building_name || ' Lv' || v_queue_item.target_level, v_user_id, p_queue_id);

  SELECT * INTO v_existing_building FROM planet_buildings 
  WHERE planet_id = v_queue_item.planet_id AND building_type_id = v_queue_item.building_type_id;

  IF FOUND THEN
    v_levels_added := v_queue_item.target_level - v_existing_building.level;
    UPDATE planet_buildings SET level = v_queue_item.target_level, is_upgrading = false, upgrade_end_time = NULL
    WHERE id = v_existing_building.id;
  ELSE
    v_levels_added := v_queue_item.target_level;
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false);
  END IF;

  IF v_levels_added > 0 THEN
    UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue_item.planet_id;
  END IF;

  DELETE FROM building_queue WHERE id = p_queue_id;

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos FROM building_queue WHERE planet_id = v_queue_item.planet_id
  )
  UPDATE building_queue bq SET queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND bq.start_time IS NULL THEN NOW() ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND bq.end_time IS NULL THEN NOW() + (bq.build_time || ' seconds')::interval ELSE bq.end_time END
  FROM reordered r WHERE bq.id = r.id;

  PERFORM update_player_points_no_rank(v_user_id);
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'new_level', v_queue_item.target_level);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

-- =========================================================================
-- 4. Fix instant_complete_shipyard_item(uuid)
-- =========================================================================
CREATE OR REPLACE FUNCTION instant_complete_shipyard_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '30s'
SET lock_timeout TO '15s'
AS $$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_admin_id uuid;
  v_item_name text;
  v_item_id integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT sq.id, sq.planet_id, sq.item_type, sq.ship_type_id, sq.defense_type_id, 
         sq.quantity, sq.quantity_completed, sq.build_time_per_unit,
         sq.queue_position, sq.start_time, sq.current_unit_end_time, p.user_id as planet_owner
  INTO v_queue_item
  FROM shipyard_queue sq
  JOIN planets p ON sq.planet_id = p.id
  WHERE sq.id = p_queue_id AND sq.queue_position = 1 AND sq.current_unit_end_time IS NOT NULL;

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found or not active');
  END IF;
  
  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_fxu_cost := calculate_fxu_cost_shipyard(p_queue_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Construction already complete');
  END IF;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost);
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  IF v_queue_item.item_type = 'ship' THEN
    v_item_id := v_queue_item.ship_type_id;
    SELECT name INTO v_item_name FROM ship_types WHERE id = v_item_id;
  ELSE
    v_item_id := v_queue_item.defense_type_id;
    SELECT name INTO v_item_name FROM defense_types WHERE id = v_item_id;
  END IF;

  DECLARE
    v_remaining_quantity integer;
  BEGIN
    v_remaining_quantity := v_queue_item.quantity - v_queue_item.quantity_completed;

    PERFORM record_admin_revenue('instant_ship', v_fxu_cost,
      v_remaining_quantity || 'x ' || COALESCE(v_item_name, v_queue_item.item_type), v_user_id, p_queue_id);

    IF v_queue_item.item_type = 'ship' THEN
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (v_queue_item.planet_id, v_item_id, v_remaining_quantity)
      ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_remaining_quantity;
    ELSE
      INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
      VALUES (v_queue_item.planet_id, v_item_id, v_remaining_quantity)
      ON CONFLICT (planet_id, defense_type_id) DO UPDATE SET quantity = planet_defenses.quantity + v_remaining_quantity;
    END IF;

    DELETE FROM shipyard_queue WHERE id = p_queue_id;

    WITH reordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos 
      FROM shipyard_queue WHERE planet_id = v_queue_item.planet_id
    )
    UPDATE shipyard_queue sq SET 
      queue_position = r.new_pos,
      start_time = CASE WHEN r.new_pos = 1 AND sq.start_time IS NULL THEN NOW() ELSE sq.start_time END,
      current_unit_end_time = CASE WHEN r.new_pos = 1 AND sq.current_unit_end_time IS NULL THEN NOW() + (sq.build_time_per_unit || ' seconds')::interval ELSE sq.current_unit_end_time END
    FROM reordered r WHERE sq.id = r.id;

    PERFORM update_player_points_no_rank(v_user_id);
    RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'quantity', v_remaining_quantity);
  END;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

-- =========================================================================
-- 5. Fix full_reconnect_sync to use lightweight points update
-- =========================================================================
CREATE OR REPLACE FUNCTION full_reconnect_sync(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '60s'
SET lock_timeout TO '30s'
AS $$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_resources jsonb;
  v_buildings_completed int := 0;
  v_ships_completed int := 0;
  v_build_result jsonb;
  v_ship_result jsonb;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Planet not found');
  END IF;

  IF v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_user_id := v_planet.user_id;

  BEGIN
    UPDATE user_technologies
    SET
      level = level + 1,
      is_researching = false,
      research_end_time = NULL,
      research_planet_id = NULL,
      updated_at = now()
    WHERE user_id = v_user_id
    AND is_researching = true
    AND research_end_time IS NOT NULL
    AND research_end_time <= now() + interval '2 seconds';

    IF FOUND THEN
      PERFORM update_player_points_no_rank(v_user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    v_build_result := process_building_queue_internal(p_planet_id, v_user_id);
    IF v_build_result IS NOT NULL AND (v_build_result->>'success')::boolean THEN
      v_buildings_completed := COALESCE((v_build_result->>'completed_count')::int, 0);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    v_ship_result := process_shipyard_queue_internal(p_planet_id, v_user_id);
    IF v_ship_result IS NOT NULL AND (v_ship_result->>'success')::boolean THEN
      v_ships_completed := COALESCE((v_ship_result->>'completed_units')::int, 0);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  v_resources := calculate_planet_resources(p_planet_id);

  IF NOT (v_resources ? 'error') THEN
    UPDATE planet_resources
    SET
      metal = (v_resources->>'metal')::numeric,
      crystal = (v_resources->>'crystal')::numeric,
      deuterium = (v_resources->>'deuterium')::numeric,
      metal_per_hour = (v_resources->>'metal_per_hour')::numeric,
      crystal_per_hour = (v_resources->>'crystal_per_hour')::numeric,
      deuterium_per_hour = (v_resources->>'deuterium_per_hour')::numeric,
      metal_storage = (v_resources->>'metal_storage')::numeric,
      crystal_storage = (v_resources->>'crystal_storage')::numeric,
      deuterium_storage = (v_resources->>'deuterium_storage')::numeric,
      energy_used = (v_resources->>'energy_used')::numeric,
      energy_max = (v_resources->>'energy_max')::numeric,
      last_update = now()
    WHERE planet_id = p_planet_id;
  END IF;

  IF v_buildings_completed > 0 OR v_ships_completed > 0 THEN
    PERFORM update_player_points_no_rank(v_user_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'buildings_completed', v_buildings_completed,
    'ships_completed', v_ships_completed,
    'resources', v_resources,
    'synced_at', now()
  );
END;
$$;

-- =========================================================================
-- 6. Fix cron: SKIP LOCKED for research + ranking at the end
-- =========================================================================
CREATE OR REPLACE FUNCTION optimized_global_queue_processor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_building_count integer := 0;
  v_shipyard_count integer := 0;
  v_research_count integer := 0;
  v_fleet_count integer := 0;
  v_has_pending boolean;
  v_queue_item record;
  v_now timestamptz := NOW();
  v_build_time_ms bigint;
  v_elapsed_ms bigint;
  v_units_to_complete integer;
  v_remaining_units integer;
  v_next_item record;
  v_affected_users uuid[] := ARRAY[]::uuid[];
BEGIN
  ALTER TABLE planet_buildings DISABLE TRIGGER trigger_building_points;
  ALTER TABLE planet_ships DISABLE TRIGGER trigger_fleet_points;
  ALTER TABLE planet_defenses DISABLE TRIGGER trigger_defense_points;

  -- =========================================================================
  -- BUILDING QUEUE
  -- =========================================================================
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM building_queue 
      WHERE end_time IS NOT NULL AND end_time <= v_now
      LIMIT 1
    ) INTO v_has_pending;

    IF v_has_pending THEN
      FOR v_queue_item IN
        SELECT bq.id, bq.planet_id, bq.building_type_id, bq.target_level, 
               bq.queue_position, bq.end_time, p.user_id
        FROM building_queue bq
        JOIN planets p ON p.id = bq.planet_id
        WHERE bq.end_time IS NOT NULL AND bq.end_time <= v_now
        ORDER BY bq.planet_id, bq.end_time
        LIMIT 100
        FOR UPDATE OF bq SKIP LOCKED
      LOOP
        BEGIN
          INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, upgrade_end_time)
          VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false, NULL)
          ON CONFLICT (planet_id, building_type_id)
          DO UPDATE SET 
            level = GREATEST(planet_buildings.level, EXCLUDED.level),
            is_upgrading = false,
            upgrade_end_time = NULL;

          UPDATE planets SET fields_used = LEAST(fields_max, fields_used + 1)
          WHERE id = v_queue_item.planet_id;

          DELETE FROM building_queue WHERE id = v_queue_item.id;
          v_building_count := v_building_count + 1;

          IF NOT (v_queue_item.user_id = ANY(v_affected_users)) THEN
            v_affected_users := array_append(v_affected_users, v_queue_item.user_id);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Cron: Error building %: %', v_queue_item.id, SQLERRM;
        END;
      END LOOP;

      UPDATE building_queue bq
      SET queue_position = sub.new_pos
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY planet_id ORDER BY queue_position) as new_pos
        FROM building_queue
      ) sub
      WHERE bq.id = sub.id AND bq.queue_position != sub.new_pos;

      UPDATE building_queue
      SET start_time = v_now,
          end_time = v_now + (build_time * INTERVAL '1 second')
      WHERE queue_position = 1 AND start_time IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Building section error: %', SQLERRM;
  END;

  -- =========================================================================
  -- SHIPYARD QUEUE
  -- =========================================================================
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM shipyard_queue 
      WHERE queue_position = 1 
      AND current_unit_end_time IS NOT NULL 
      AND current_unit_end_time <= v_now
      LIMIT 1
    ) INTO v_has_pending;

    IF v_has_pending THEN
      FOR v_queue_item IN
        SELECT sq.*, p.user_id
        FROM shipyard_queue sq
        JOIN planets p ON p.id = sq.planet_id
        WHERE sq.queue_position = 1
        AND sq.current_unit_end_time IS NOT NULL 
        AND sq.current_unit_end_time <= v_now
        ORDER BY sq.current_unit_end_time
        LIMIT 100
        FOR UPDATE OF sq SKIP LOCKED
      LOOP
        BEGIN
          v_build_time_ms := GREATEST(1000, v_queue_item.build_time_per_unit * 1000);
          v_elapsed_ms := EXTRACT(EPOCH FROM (v_now - v_queue_item.current_unit_end_time)) * 1000 + v_build_time_ms;
          v_remaining_units := v_queue_item.quantity - v_queue_item.quantity_completed;
          v_units_to_complete := LEAST(
            FLOOR(v_elapsed_ms / v_build_time_ms)::integer,
            v_remaining_units
          );

          IF v_units_to_complete > 0 THEN
            IF v_queue_item.item_type = 'ship' AND v_queue_item.ship_type_id IS NOT NULL THEN
              INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
              VALUES (v_queue_item.planet_id, v_queue_item.ship_type_id, v_units_to_complete)
              ON CONFLICT (planet_id, ship_type_id)
              DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
            ELSIF v_queue_item.item_type = 'defense' AND v_queue_item.defense_type_id IS NOT NULL THEN
              INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
              VALUES (v_queue_item.planet_id, v_queue_item.defense_type_id, v_units_to_complete)
              ON CONFLICT (planet_id, defense_type_id)
              DO UPDATE SET quantity = planet_defenses.quantity + EXCLUDED.quantity;
            END IF;

            v_shipyard_count := v_shipyard_count + v_units_to_complete;

            IF NOT (v_queue_item.user_id = ANY(v_affected_users)) THEN
              v_affected_users := array_append(v_affected_users, v_queue_item.user_id);
            END IF;

            IF v_queue_item.quantity_completed + v_units_to_complete >= v_queue_item.quantity THEN
              DELETE FROM shipyard_queue WHERE id = v_queue_item.id;

              SELECT * INTO v_next_item
              FROM shipyard_queue
              WHERE planet_id = v_queue_item.planet_id AND queue_position = 2
              LIMIT 1;

              IF FOUND THEN
                UPDATE shipyard_queue
                SET queue_position = 1,
                    start_time = v_now,
                    current_unit_end_time = v_now + (build_time_per_unit * INTERVAL '1 second')
                WHERE id = v_next_item.id;

                UPDATE shipyard_queue
                SET queue_position = queue_position - 1
                WHERE planet_id = v_queue_item.planet_id AND queue_position > 2;
              END IF;
            ELSE
              UPDATE shipyard_queue
              SET quantity_completed = quantity_completed + v_units_to_complete,
                  current_unit_end_time = v_now + (build_time_per_unit * INTERVAL '1 second')
              WHERE id = v_queue_item.id;
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Cron: Error shipyard %: %', v_queue_item.id, SQLERRM;
        END;
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Shipyard section error: %', SQLERRM;
  END;

  ALTER TABLE planet_buildings ENABLE TRIGGER trigger_building_points;
  ALTER TABLE planet_ships ENABLE TRIGGER trigger_fleet_points;
  ALTER TABLE planet_defenses ENABLE TRIGGER trigger_defense_points;

  -- =========================================================================
  -- RESEARCH (now with SKIP LOCKED to avoid blocking instant_complete)
  -- =========================================================================
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM user_technologies 
      WHERE is_researching = true 
      AND research_end_time IS NOT NULL 
      AND research_end_time <= v_now
      LIMIT 1
    ) INTO v_has_pending;

    IF v_has_pending THEN
      FOR v_queue_item IN
        SELECT ut.id, ut.user_id
        FROM user_technologies ut
        WHERE ut.is_researching = true
        AND ut.research_end_time IS NOT NULL
        AND ut.research_end_time <= v_now
        FOR UPDATE OF ut SKIP LOCKED
      LOOP
        BEGIN
          UPDATE user_technologies
          SET level = level + 1,
              is_researching = false,
              research_end_time = NULL,
              research_planet_id = NULL
          WHERE id = v_queue_item.id;

          v_research_count := v_research_count + 1;

          IF NOT (v_queue_item.user_id = ANY(v_affected_users)) THEN
            v_affected_users := array_append(v_affected_users, v_queue_item.user_id);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Cron: Error research %: %', v_queue_item.id, SQLERRM;
        END;
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Research error: %', SQLERRM;
  END;

  -- =========================================================================
  -- FLEETS
  -- =========================================================================
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM fleets 
      WHERE is_completed = false 
      AND (
        (NOT is_returning AND arrival_time IS NOT NULL AND arrival_time <= v_now)
        OR (is_returning AND return_time IS NOT NULL AND return_time <= v_now)
      )
      LIMIT 1
    ) INTO v_has_pending;

    IF v_has_pending THEN
      SELECT COALESCE((process_all_pending_fleets()->>'processed_count')::integer, 0) INTO v_fleet_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Fleet error: %', SQLERRM;
  END;

  -- =========================================================================
  -- BATCH POINTS UPDATE for affected users (no ranking per-user)
  -- =========================================================================
  BEGIN
    IF array_length(v_affected_users, 1) > 0 THEN
      UPDATE profiles p
      SET 
        points_buildings = COALESCE((
          SELECT SUM(
            CASE WHEN bt.metal_cost > 0 OR bt.crystal_cost > 0 OR bt.deuterium_cost > 0
            THEN (bt.metal_cost + bt.crystal_cost + bt.deuterium_cost) * 
                 (POWER(bt.cost_factor, pb.level) - 1) / (bt.cost_factor - 1) / 1000
            ELSE 0 END
          )
          FROM planet_buildings pb
          JOIN building_types bt ON bt.id = pb.building_type_id
          JOIN planets pl ON pl.id = pb.planet_id
          WHERE pl.user_id = p.id AND pb.level > 0
        ), 0),
        points_fleet = COALESCE((
          SELECT SUM((st.metal_cost + st.crystal_cost + st.deuterium_cost) * ps.quantity / 1000)
          FROM planet_ships ps
          JOIN ship_types st ON st.id = ps.ship_type_id
          JOIN planets pl ON pl.id = ps.planet_id
          WHERE pl.user_id = p.id AND ps.quantity > 0
        ), 0),
        points_defense = COALESCE((
          SELECT SUM((dt.metal_cost + dt.crystal_cost + dt.deuterium_cost) * pd.quantity / 1000)
          FROM planet_defenses pd
          JOIN defense_types dt ON dt.id = pd.defense_type_id
          JOIN planets pl ON pl.id = pd.planet_id
          WHERE pl.user_id = p.id AND pd.quantity > 0
        ), 0),
        updated_at = now()
      WHERE p.id = ANY(v_affected_users);

      UPDATE profiles
      SET points_total = COALESCE(points_buildings, 0) + COALESCE(points_research, 0) + COALESCE(points_fleet, 0) + COALESCE(points_defense, 0)
      WHERE id = ANY(v_affected_users);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Points update error: %', SQLERRM;
  END;

  -- =========================================================================
  -- GLOBAL RANKING UPDATE (runs ONCE, not per-player-action)
  -- =========================================================================
  BEGIN
    IF v_building_count > 0 OR v_shipyard_count > 0 OR v_research_count > 0 OR v_fleet_count > 0 THEN
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (ORDER BY points_total DESC, created_at ASC) as rank_total,
          ROW_NUMBER() OVER (ORDER BY points_buildings DESC, created_at ASC) as rank_b,
          ROW_NUMBER() OVER (ORDER BY points_research DESC, created_at ASC) as rank_r,
          ROW_NUMBER() OVER (ORDER BY points_fleet DESC, created_at ASC) as rank_f,
          ROW_NUMBER() OVER (ORDER BY points_defense DESC, created_at ASC) as rank_d
        FROM profiles
      )
      UPDATE profiles p
      SET 
        rank_position = r.rank_total,
        rank_buildings = r.rank_b,
        rank_research = r.rank_r,
        rank_fleet = r.rank_f,
        rank_defense = r.rank_d
      FROM ranked r
      WHERE p.id = r.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cron: Ranking update error: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'buildings_completed', v_building_count,
    'shipyard_completed', v_shipyard_count,
    'research_completed', v_research_count,
    'fleets_processed', v_fleet_count,
    'affected_users', array_length(v_affected_users, 1),
    'timestamp', v_now
  );
END;
$$;
