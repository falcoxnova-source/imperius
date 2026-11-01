/*
  # Fix ACS Combat - Use authentic xNova combat engine

  ## Problem
  The `perform_acs_combat` function had two critical bugs:
  1. It used a simplified damage formula that rarely killed units, causing almost all battles to end as "draw"
  2. It returned JSON keys ('outcome', 'attacker_ships_remaining') that did NOT match what
     `process_acs_fleet_arrival` expects ('result', 'attacker_remaining'), causing:
     - Combat result always read as NULL -> defaults to draw
     - Attacker remaining units read as NULL -> all ships deleted/lost
     - Players lose their entire fleet regardless of actual combat outcome

  ## Fix
  Rewrite `perform_acs_combat` to:
  1. Build proper unit arrays with technology bonuses (same as `perform_combat`)
  2. Track `fleet_id` per attacker unit group for correct ship return
  3. Use `simulate_xnova_combat` (the authentic combat engine) for the actual simulation
  4. Return all JSON keys that `process_acs_fleet_arrival` expects

  ## Changes
  - Replaced `perform_acs_combat` function entirely
  - Now delegates combat to `simulate_xnova_combat` like regular attacks do
  - Properly tracks fleet contributions for loot distribution
  - Returns correct JSON structure matching consumer expectations
*/

CREATE OR REPLACE FUNCTION perform_acs_combat(p_acs_id uuid, p_target_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attacker_units jsonb := '[]'::jsonb;
  v_defender_units jsonb := '[]'::jsonb;
  v_combat_result jsonb;
  v_fleet_record RECORD;
  v_ship_record RECORD;
  v_defense_record RECORD;
  v_defender_id uuid;
  v_weapon_bonus numeric;
  v_shield_bonus numeric;
  v_hull_bonus numeric;
  v_weapon numeric;
  v_shield numeric;
  v_hull numeric;
  v_fleet_contributions jsonb := '[]'::jsonb;
  v_fleet_power numeric;
  v_total_fleet_power numeric := 0;
  v_unit jsonb;
  v_i integer;
BEGIN
  SELECT user_id INTO v_defender_id FROM planets WHERE id = p_target_planet_id;

  FOR v_fleet_record IN
    SELECT ap.fleet_id, ap.user_id
    FROM acs_participants ap
    WHERE ap.acs_id = p_acs_id
  LOOP
    SELECT
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_fleet_record.user_id AND tt.code = 'weapons_tech'), 0),
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_fleet_record.user_id AND tt.code = 'shielding_tech'), 0),
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_fleet_record.user_id AND tt.code = 'armour_tech'), 0)
    INTO v_weapon_bonus, v_shield_bonus, v_hull_bonus;

    v_fleet_power := 0;

    FOR v_ship_record IN
      SELECT fs.ship_type_id, fs.quantity, st.code, st.name, st.weapon_power, st.shield_power,
             st.structural_integrity, st.metal_cost, st.crystal_cost, st.rapid_fire, st.cargo_capacity
      FROM fleet_ships fs
      JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = v_fleet_record.fleet_id AND fs.quantity > 0
    LOOP
      v_weapon := FLOOR(v_ship_record.weapon_power * (1 + v_weapon_bonus * 0.10));
      v_shield := FLOOR(v_ship_record.shield_power * (1 + v_shield_bonus * 0.10));
      v_hull := FLOOR(v_ship_record.structural_integrity * (1 + v_hull_bonus * 0.10));

      v_fleet_power := v_fleet_power + (v_weapon * v_ship_record.quantity);

      v_attacker_units := v_attacker_units || jsonb_build_object(
        'type_id', v_ship_record.ship_type_id,
        'code', v_ship_record.code,
        'name', v_ship_record.name,
        'quantity', v_ship_record.quantity,
        'initial_quantity', v_ship_record.quantity,
        'weapon', v_weapon,
        'shield', v_shield,
        'hull', v_hull,
        'current_hull', v_hull * v_ship_record.quantity,
        'current_shield', v_shield * v_ship_record.quantity,
        'metal_cost', v_ship_record.metal_cost,
        'crystal_cost', v_ship_record.crystal_cost,
        'cargo_capacity', COALESCE(v_ship_record.cargo_capacity, 0),
        'rapid_fire', COALESCE(v_ship_record.rapid_fire, '{}'::jsonb),
        'is_defense', false,
        'fleet_id', v_fleet_record.fleet_id::text
      );
    END LOOP;

    v_total_fleet_power := v_total_fleet_power + v_fleet_power;

    v_fleet_contributions := v_fleet_contributions || jsonb_build_object(
      'fleet_id', v_fleet_record.fleet_id::text,
      'user_id', v_fleet_record.user_id::text,
      'power', v_fleet_power
    );
  END LOOP;

  SELECT
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_defender_id AND tt.code = 'weapons_tech'), 0),
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_defender_id AND tt.code = 'shielding_tech'), 0),
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_defender_id AND tt.code = 'armour_tech'), 0)
  INTO v_weapon_bonus, v_shield_bonus, v_hull_bonus;

  FOR v_ship_record IN
    SELECT ps.ship_type_id, ps.quantity, st.code, st.name, st.weapon_power, st.shield_power,
           st.structural_integrity, st.metal_cost, st.crystal_cost, st.rapid_fire
    FROM planet_ships ps
    JOIN ship_types st ON ps.ship_type_id = st.id
    WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0
  LOOP
    v_weapon := FLOOR(v_ship_record.weapon_power * (1 + v_weapon_bonus * 0.10));
    v_shield := FLOOR(v_ship_record.shield_power * (1 + v_shield_bonus * 0.10));
    v_hull := FLOOR(v_ship_record.structural_integrity * (1 + v_hull_bonus * 0.10));

    v_defender_units := v_defender_units || jsonb_build_object(
      'type_id', v_ship_record.ship_type_id,
      'code', v_ship_record.code,
      'name', v_ship_record.name,
      'quantity', v_ship_record.quantity,
      'initial_quantity', v_ship_record.quantity,
      'weapon', v_weapon,
      'shield', v_shield,
      'hull', v_hull,
      'current_hull', v_hull * v_ship_record.quantity,
      'current_shield', v_shield * v_ship_record.quantity,
      'metal_cost', v_ship_record.metal_cost,
      'crystal_cost', v_ship_record.crystal_cost,
      'rapid_fire', COALESCE(v_ship_record.rapid_fire, '{}'::jsonb),
      'is_defense', false
    );
  END LOOP;

  FOR v_defense_record IN
    SELECT pd.defense_type_id, pd.quantity, dt.code, dt.name, dt.weapon_power, dt.shield_power,
           dt.structural_integrity, dt.metal_cost, dt.crystal_cost
    FROM planet_defenses pd
    JOIN defense_types dt ON pd.defense_type_id = dt.id
    WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0
    AND dt.code NOT IN ('interplanetary_missile', 'anti_ballistic_missile')
  LOOP
    v_weapon := FLOOR(v_defense_record.weapon_power * (1 + v_weapon_bonus * 0.10));
    v_shield := FLOOR(v_defense_record.shield_power * (1 + v_shield_bonus * 0.10));
    v_hull := FLOOR(v_defense_record.structural_integrity * (1 + v_hull_bonus * 0.10));

    v_defender_units := v_defender_units || jsonb_build_object(
      'type_id', v_defense_record.defense_type_id,
      'code', v_defense_record.code,
      'name', v_defense_record.name,
      'quantity', v_defense_record.quantity,
      'initial_quantity', v_defense_record.quantity,
      'weapon', v_weapon,
      'shield', v_shield,
      'hull', v_hull,
      'current_hull', v_hull * v_defense_record.quantity,
      'current_shield', v_shield * v_defense_record.quantity,
      'metal_cost', v_defense_record.metal_cost,
      'crystal_cost', v_defense_record.crystal_cost,
      'rapid_fire', '{}'::jsonb,
      'is_defense', true
    );
  END LOOP;

  v_combat_result := simulate_xnova_combat(v_attacker_units, v_defender_units);

  RETURN jsonb_build_object(
    'result', v_combat_result->>'result',
    'rounds', v_combat_result->>'rounds',
    'rounds_data', v_combat_result->'rounds_data',
    'attacker_remaining', v_combat_result->'attacker_remaining',
    'defender_remaining', v_combat_result->'defender_remaining',
    'debris_metal', v_combat_result->'debris_metal',
    'debris_crystal', v_combat_result->'debris_crystal',
    'attacker_losses_metal', v_combat_result->'attacker_losses_metal',
    'attacker_losses_crystal', v_combat_result->'attacker_losses_crystal',
    'defender_losses_metal', v_combat_result->'defender_losses_metal',
    'defender_losses_crystal', v_combat_result->'defender_losses_crystal',
    'destroyed_defenses', v_combat_result->'destroyed_defenses',
    'initial_attacker', v_combat_result->'initial_attacker',
    'initial_defender', v_combat_result->'initial_defender',
    'fleet_contributions', v_fleet_contributions,
    'total_fleet_power', v_total_fleet_power
  );
END;
$$;
