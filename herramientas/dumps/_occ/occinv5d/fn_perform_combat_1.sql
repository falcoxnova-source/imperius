CREATE OR REPLACE FUNCTION public.perform_combat(p_attacker_fleet_id uuid, p_target_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attacker_units jsonb := '[]'::jsonb;
  v_defender_units jsonb := '[]'::jsonb;
  v_combat_result jsonb;
  v_ship_record record;
  v_defense_record record;
  v_allied_fleet record;
  v_attacker_id uuid;
  v_defender_id uuid;
  v_weapon_bonus numeric;
  v_shield_bonus numeric;
  v_hull_bonus numeric;
  v_weapon numeric;
  v_shield numeric;
  v_hull numeric;
BEGIN
  SELECT user_id INTO v_attacker_id FROM fleets WHERE id = p_attacker_fleet_id;
  SELECT user_id INTO v_defender_id FROM planets WHERE id = p_target_planet_id;

  -- === ATTACKER UNITS ===
  SELECT 
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_attacker_id AND tt.code = 'weapons_tech'), 0),
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_attacker_id AND tt.code = 'shielding_tech'), 0),
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_attacker_id AND tt.code = 'armour_tech'), 0)
  INTO v_weapon_bonus, v_shield_bonus, v_hull_bonus;

  FOR v_ship_record IN
    SELECT fs.ship_type_id, fs.quantity, st.code, st.name, st.weapon_power, st.shield_power,
           st.structural_integrity, st.metal_cost, st.crystal_cost, st.rapid_fire
    FROM fleet_ships fs
    JOIN ship_types st ON fs.ship_type_id = st.id
    WHERE fs.fleet_id = p_attacker_fleet_id AND fs.quantity > 0
  LOOP
    v_weapon := FLOOR(v_ship_record.weapon_power * (1 + v_weapon_bonus * 0.10));
    v_shield := FLOOR(v_ship_record.shield_power * (1 + v_shield_bonus * 0.10));
    v_hull := FLOOR(v_ship_record.structural_integrity * (1 + v_hull_bonus * 0.10));
    
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
      'rapid_fire', COALESCE(v_ship_record.rapid_fire, '{}'::jsonb),
      'is_defense', false,
      'source', 'planet'
    );
  END LOOP;

  -- === DEFENDER UNITS (planet owner ships) ===
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
      'is_defense', false,
      'source', 'planet'
    );
  END LOOP;

  -- === DEFENDER DEFENSES ===
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
      'is_defense', true,
      'source', 'defense'
    );
  END LOOP;

  -- === ALLIED STATIONED FLEETS (deployed on this planet via Alliance Depot) ===
  -- FIX: Was 'hold', must be 'deploy' (that's how fleets are stored)
  FOR v_allied_fleet IN
    SELECT f.id as fleet_id, f.user_id as ally_user_id
    FROM fleets f
    WHERE f.target_galaxy = (SELECT galaxy FROM planets WHERE id = p_target_planet_id)
      AND f.target_system = (SELECT solar_system FROM planets WHERE id = p_target_planet_id)
      AND f.target_position = (SELECT position FROM planets WHERE id = p_target_planet_id)
      AND f.mission_type = 'deploy'
      AND COALESCE(f.target_type, 'planet') = (SELECT planet_type FROM planets WHERE id = p_target_planet_id)
      AND f.is_completed = false
      AND f.is_returning = false
      AND f.user_id != v_defender_id
      AND f.user_id != v_attacker_id
      AND f.arrival_time <= now()
  LOOP
    -- Get this ally's tech bonuses
    SELECT 
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'weapons_tech'), 0),
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'shielding_tech'), 0),
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'armour_tech'), 0)
    INTO v_weapon_bonus, v_shield_bonus, v_hull_bonus;

    -- Add this ally's ships as defender units, tagged with fleet_id as source
    FOR v_ship_record IN
      SELECT fs.ship_type_id, fs.quantity, st.code, st.name, st.weapon_power, st.shield_power,
             st.structural_integrity, st.metal_cost, st.crystal_cost, st.rapid_fire
      FROM fleet_ships fs
      JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = v_allied_fleet.fleet_id AND fs.quantity > 0
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
        'is_defense', false,
        'source', v_allied_fleet.fleet_id::text
      );
    END LOOP;
  END LOOP;

  -- Run the combat simulation
  v_combat_result := simulate_xnova_combat(v_attacker_units, v_defender_units);

  RETURN v_combat_result;
END;
$function$

