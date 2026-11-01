/*
  # Fix ACS Functions - Correct Column Name
  
  ## Problem
  The column in acs_participants is `acs_id`, not `acs_fleet_id`
  
  ## Functions Fixed
  - get_acs_combined_ships
  - distribute_acs_ships_after_combat
  - get_acs_total_cargo_capacity
  - distribute_acs_loot
*/

-- Fix get_acs_combined_ships
CREATE OR REPLACE FUNCTION get_acs_combined_ships(p_acs_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combined_ships jsonb := '{}';
  v_fleet_ships RECORD;
  v_ship_key text;
  v_ship_count integer;
BEGIN
  FOR v_fleet_ships IN
    SELECT fs.ship_type_id, fs.quantity, st.code
    FROM acs_participants ap
    JOIN fleet_ships fs ON ap.fleet_id = fs.fleet_id
    JOIN ship_types st ON fs.ship_type_id = st.id
    WHERE ap.acs_id = p_acs_id
  LOOP
    v_ship_key := v_fleet_ships.code;
    v_ship_count := COALESCE((v_combined_ships->>v_ship_key)::integer, 0) + v_fleet_ships.quantity;
    v_combined_ships := v_combined_ships || jsonb_build_object(v_ship_key, v_ship_count);
  END LOOP;

  RETURN v_combined_ships;
END;
$$;

-- Fix distribute_acs_ships_after_combat
CREATE OR REPLACE FUNCTION distribute_acs_ships_after_combat(
  p_acs_id uuid,
  p_remaining_ships jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant RECORD;
  v_ship_code text;
  v_original_total integer;
  v_remaining_total integer;
  v_participant_remaining integer;
  v_ratio numeric;
BEGIN
  FOR v_ship_code IN SELECT jsonb_object_keys(p_remaining_ships)
  LOOP
    v_remaining_total := COALESCE((p_remaining_ships->>v_ship_code)::integer, 0);
    
    SELECT COALESCE(SUM(fs.quantity), 0) INTO v_original_total
    FROM acs_participants ap
    JOIN fleet_ships fs ON ap.fleet_id = fs.fleet_id
    JOIN ship_types st ON fs.ship_type_id = st.id
    WHERE ap.acs_id = p_acs_id AND st.code = v_ship_code;
    
    IF v_original_total > 0 THEN
      v_ratio := v_remaining_total::numeric / v_original_total::numeric;
      
      FOR v_participant IN
        SELECT ap.fleet_id, fs.id as fleet_ship_id, fs.quantity
        FROM acs_participants ap
        JOIN fleet_ships fs ON ap.fleet_id = fs.fleet_id
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE ap.acs_id = p_acs_id AND st.code = v_ship_code
      LOOP
        v_participant_remaining := FLOOR(v_participant.quantity * v_ratio)::integer;
        UPDATE fleet_ships SET quantity = v_participant_remaining WHERE id = v_participant.fleet_ship_id;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- Fix get_acs_total_cargo_capacity
CREATE OR REPLACE FUNCTION get_acs_total_cargo_capacity(p_acs_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_capacity bigint := 0;
BEGIN
  SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0) INTO v_total_capacity
  FROM acs_participants ap
  JOIN fleet_ships fs ON ap.fleet_id = fs.fleet_id
  JOIN ship_types st ON fs.ship_type_id = st.id
  WHERE ap.acs_id = p_acs_id;

  RETURN v_total_capacity;
END;
$$;

-- Fix distribute_acs_loot
CREATE OR REPLACE FUNCTION distribute_acs_loot(
  p_acs_id uuid,
  p_metal bigint,
  p_crystal bigint,
  p_deuterium bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_capacity bigint;
  v_participant RECORD;
  v_ratio numeric;
  v_metal_share bigint;
  v_crystal_share bigint;
  v_deut_share bigint;
BEGIN
  v_total_capacity := get_acs_total_cargo_capacity(p_acs_id);
  
  IF v_total_capacity <= 0 THEN
    RETURN;
  END IF;

  FOR v_participant IN
    SELECT ap.fleet_id, f.user_id,
      COALESCE(SUM(fs.quantity * st.cargo_capacity), 0) as capacity
    FROM acs_participants ap
    JOIN fleets f ON ap.fleet_id = f.id
    JOIN fleet_ships fs ON ap.fleet_id = fs.fleet_id
    JOIN ship_types st ON fs.ship_type_id = st.id
    WHERE ap.acs_id = p_acs_id
    GROUP BY ap.fleet_id, f.user_id
  LOOP
    v_ratio := v_participant.capacity::numeric / v_total_capacity::numeric;
    v_metal_share := FLOOR(p_metal * v_ratio)::bigint;
    v_crystal_share := FLOOR(p_crystal * v_ratio)::bigint;
    v_deut_share := FLOOR(p_deuterium * v_ratio)::bigint;
    
    UPDATE fleets 
    SET cargo_metal = COALESCE(cargo_metal, 0) + v_metal_share,
        cargo_crystal = COALESCE(cargo_crystal, 0) + v_crystal_share,
        cargo_deuterium = COALESCE(cargo_deuterium, 0) + v_deut_share
    WHERE id = v_participant.fleet_id;
  END LOOP;
END;
$$;
