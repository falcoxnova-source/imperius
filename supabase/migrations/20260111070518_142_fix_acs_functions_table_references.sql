/*
  # Fix ACS Functions - Correct Table and Column References
  
  ## Problem
  ACS (Allied Combat System) functions reference non-existent tables and columns:
  - `ships` should be `ship_types`
  - `defenses` should be `defense_types`
  - `internal_name` should be `code`
  - `hull` should be `structural_integrity`
  - `ship_id` should be `ship_type_id`
  - `defense_id` should be `defense_type_id`
  
  ## Functions Fixed
  1. get_acs_combined_ships
  2. perform_acs_combat
  3. distribute_acs_ships_after_combat
  4. get_acs_total_cargo_capacity
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
    WHERE ap.acs_fleet_id = p_acs_id
  LOOP
    v_ship_key := v_fleet_ships.code;
    v_ship_count := COALESCE((v_combined_ships->>v_ship_key)::integer, 0) + v_fleet_ships.quantity;
    v_combined_ships := v_combined_ships || jsonb_build_object(v_ship_key, v_ship_count);
  END LOOP;

  RETURN v_combined_ships;
END;
$$;

-- Fix perform_acs_combat
CREATE OR REPLACE FUNCTION perform_acs_combat(p_acs_id uuid, p_target_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attacker_ships jsonb;
  v_defender_ships jsonb := '{}';
  v_defender_defense jsonb := '{}';
  v_planet RECORD;
  v_result jsonb;
  v_round integer := 0;
  v_max_rounds integer := 6;
  v_attacker_alive boolean := true;
  v_defender_alive boolean := true;
  v_rounds jsonb := '[]';
  v_round_data jsonb;
  v_ship RECORD;
  v_def RECORD;
  v_attacker_power numeric := 0;
  v_defender_power numeric := 0;
  v_damage numeric;
  v_ship_losses jsonb := '{}';
  v_def_losses jsonb := '{}';
  v_loss_count integer;
  v_total_attacker_ships integer := 0;
  v_total_defender_units integer := 0;
BEGIN
  v_attacker_ships := get_acs_combined_ships(p_acs_id);

  SELECT * INTO v_planet FROM planets WHERE id = p_target_planet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'no_target',
      'message', 'Planeta objetivo no encontrado'
    );
  END IF;

  FOR v_ship IN
    SELECT st.code, ps.quantity, st.weapon_power, st.shield_power, st.structural_integrity
    FROM planet_ships ps
    JOIN ship_types st ON ps.ship_type_id = st.id
    WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0
  LOOP
    v_defender_ships := v_defender_ships || jsonb_build_object(v_ship.code, v_ship.quantity);
    v_total_defender_units := v_total_defender_units + v_ship.quantity;
  END LOOP;

  FOR v_def IN
    SELECT dt.code, pd.quantity, dt.weapon_power, dt.shield_power, dt.structural_integrity
    FROM planet_defenses pd
    JOIN defense_types dt ON pd.defense_type_id = dt.id
    WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0
  LOOP
    v_defender_defense := v_defender_defense || jsonb_build_object(v_def.code, v_def.quantity);
    v_total_defender_units := v_total_defender_units + v_def.quantity;
  END LOOP;

  SELECT COALESCE(SUM((value)::integer), 0) INTO v_total_attacker_ships
  FROM jsonb_each_text(v_attacker_ships);

  IF v_total_defender_units = 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'attacker_wins',
      'attacker_ships_initial', v_attacker_ships,
      'attacker_ships_remaining', v_attacker_ships,
      'defender_ships_initial', v_defender_ships,
      'defender_ships_remaining', '{}',
      'defender_defense_initial', v_defender_defense,
      'defender_defense_remaining', '{}',
      'rounds', '[]',
      'metal_debris', 0,
      'crystal_debris', 0
    );
  END IF;

  WHILE v_round < v_max_rounds AND v_attacker_alive AND v_defender_alive LOOP
    v_round := v_round + 1;

    v_attacker_power := 0;
    FOR v_ship IN
      SELECT st.code, st.weapon_power
      FROM ship_types st
      WHERE st.code IN (SELECT jsonb_object_keys(v_attacker_ships))
    LOOP
      v_attacker_power := v_attacker_power + 
        (COALESCE((v_attacker_ships->>v_ship.code)::integer, 0) * v_ship.weapon_power);
    END LOOP;

    v_defender_power := 0;
    FOR v_ship IN
      SELECT st.code, st.weapon_power
      FROM ship_types st
      WHERE st.code IN (SELECT jsonb_object_keys(v_defender_ships))
    LOOP
      v_defender_power := v_defender_power + 
        (COALESCE((v_defender_ships->>v_ship.code)::integer, 0) * v_ship.weapon_power);
    END LOOP;

    FOR v_def IN
      SELECT dt.code, dt.weapon_power
      FROM defense_types dt
      WHERE dt.code IN (SELECT jsonb_object_keys(v_defender_defense))
    LOOP
      v_defender_power := v_defender_power + 
        (COALESCE((v_defender_defense->>v_def.code)::integer, 0) * v_def.weapon_power);
    END LOOP;

    v_ship_losses := '{}';
    FOR v_ship IN
      SELECT st.code, st.structural_integrity
      FROM ship_types st
      WHERE st.code IN (SELECT jsonb_object_keys(v_defender_ships))
        AND COALESCE((v_defender_ships->>st.code)::integer, 0) > 0
    LOOP
      v_damage := v_attacker_power * 0.1 / GREATEST(v_total_defender_units, 1);
      v_loss_count := LEAST(
        (v_defender_ships->>v_ship.code)::integer,
        FLOOR(v_damage / GREATEST(v_ship.structural_integrity, 1))::integer
      );
      IF v_loss_count > 0 THEN
        v_ship_losses := v_ship_losses || jsonb_build_object(v_ship.code, v_loss_count);
        v_defender_ships := v_defender_ships || jsonb_build_object(
          v_ship.code, 
          GREATEST(0, (v_defender_ships->>v_ship.code)::integer - v_loss_count)
        );
      END IF;
    END LOOP;

    v_def_losses := '{}';
    FOR v_ship IN
      SELECT st.code, st.structural_integrity
      FROM ship_types st
      WHERE st.code IN (SELECT jsonb_object_keys(v_attacker_ships))
        AND COALESCE((v_attacker_ships->>st.code)::integer, 0) > 0
    LOOP
      v_damage := v_defender_power * 0.1 / GREATEST(v_total_attacker_ships, 1);
      v_loss_count := LEAST(
        (v_attacker_ships->>v_ship.code)::integer,
        FLOOR(v_damage / GREATEST(v_ship.structural_integrity, 1))::integer
      );
      IF v_loss_count > 0 THEN
        v_def_losses := v_def_losses || jsonb_build_object(v_ship.code, v_loss_count);
        v_attacker_ships := v_attacker_ships || jsonb_build_object(
          v_ship.code, 
          GREATEST(0, (v_attacker_ships->>v_ship.code)::integer - v_loss_count)
        );
      END IF;
    END LOOP;

    v_round_data := jsonb_build_object(
      'round', v_round,
      'attacker_power', v_attacker_power,
      'defender_power', v_defender_power,
      'attacker_losses', v_def_losses,
      'defender_losses', v_ship_losses
    );
    v_rounds := v_rounds || v_round_data;

    SELECT COALESCE(SUM((value)::integer), 0) INTO v_total_attacker_ships
    FROM jsonb_each_text(v_attacker_ships);

    SELECT COALESCE(SUM((value)::integer), 0) INTO v_total_defender_units
    FROM jsonb_each_text(v_defender_ships);
    v_total_defender_units := v_total_defender_units + 
      COALESCE((SELECT SUM((value)::integer) FROM jsonb_each_text(v_defender_defense)), 0);

    v_attacker_alive := v_total_attacker_ships > 0;
    v_defender_alive := v_total_defender_units > 0;
  END LOOP;

  RETURN jsonb_build_object(
    'outcome', CASE 
      WHEN NOT v_attacker_alive AND NOT v_defender_alive THEN 'draw'
      WHEN NOT v_defender_alive THEN 'attacker_wins'
      WHEN NOT v_attacker_alive THEN 'defender_wins'
      ELSE 'draw'
    END,
    'attacker_ships_remaining', v_attacker_ships,
    'defender_ships_remaining', v_defender_ships,
    'defender_defense_remaining', v_defender_defense,
    'rounds', v_rounds,
    'total_rounds', v_round
  );
END;
$$;

-- Fix distribute_acs_ships_after_combat (both overloads if they exist)
DROP FUNCTION IF EXISTS distribute_acs_ships_after_combat(uuid, jsonb);
DROP FUNCTION IF EXISTS distribute_acs_ships_after_combat(uuid, jsonb, jsonb);

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
  v_participant_original integer;
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
    WHERE ap.acs_fleet_id = p_acs_id AND st.code = v_ship_code;
    
    IF v_original_total > 0 THEN
      v_ratio := v_remaining_total::numeric / v_original_total::numeric;
      
      FOR v_participant IN
        SELECT ap.fleet_id, fs.id as fleet_ship_id, fs.quantity
        FROM acs_participants ap
        JOIN fleet_ships fs ON ap.fleet_id = fs.fleet_id
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE ap.acs_fleet_id = p_acs_id AND st.code = v_ship_code
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
  WHERE ap.acs_fleet_id = p_acs_id;

  RETURN v_total_capacity;
END;
$$;

-- Fix distribute_acs_loot (if it has wrong references)
DROP FUNCTION IF EXISTS distribute_acs_loot(uuid, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS distribute_acs_loot(uuid, bigint, bigint, bigint);

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
  v_participant_capacity bigint;
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
    WHERE ap.acs_fleet_id = p_acs_id
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
