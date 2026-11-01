/*
  # XNova Authentic Combat System with Rapid Fire

  This migration implements the complete XNova combat system including:
  
  1. **Rapid Fire Mechanic**
     - Ships with rapid fire can attack multiple times per round
     - Chance to fire again = (rapidfire - 1) / rapidfire
     - Example: Cruiser has RF 6 vs Light Fighter = 83.3% chance to fire again
  
  2. **Tech Bonuses in ACS Combat**
     - Each fleet's ships get bonuses from their owner's tech levels
     - Weapons Tech: +10% weapon power per level
     - Shielding Tech: +10% shield power per level  
     - Armour Tech: +10% hull/structural integrity per level
  
  3. **Individual Ship Targeting**
     - Each ship targets a random enemy unit
     - Damage is applied to shield first, then hull
     - If damage > shield, excess goes to hull
     - Ship is destroyed when hull reaches 0
  
  4. **XNova Combat Rules**
     - Maximum 6 combat rounds
     - 30% debris from destroyed ships (metal + crystal only)
     - 70% defense rebuild chance after combat
     - 50% max resource loot cap
*/

-- =============================================================================
-- SECTION 1: Helper function to calculate rapid fire shots
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_rapid_fire_shots(
  p_attacker_code text,
  p_defender_code text,
  p_rapid_fire jsonb
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
DECLARE
  v_rf_value integer;
  v_shots integer := 1;
  v_continue boolean := true;
BEGIN
  IF p_rapid_fire IS NULL OR p_rapid_fire = '{}'::jsonb THEN
    RETURN 1;
  END IF;
  
  v_rf_value := COALESCE((p_rapid_fire->>p_defender_code)::integer, 0);
  
  IF v_rf_value <= 1 THEN
    RETURN 1;
  END IF;
  
  WHILE v_continue LOOP
    IF random() < ((v_rf_value - 1.0) / v_rf_value) THEN
      v_shots := v_shots + 1;
      IF v_shots >= 100 THEN
        EXIT;
      END IF;
    ELSE
      v_continue := false;
    END IF;
  END LOOP;
  
  RETURN v_shots;
END;
$$;

-- =============================================================================
-- SECTION 2: XNova authentic combat simulation function
-- =============================================================================

CREATE OR REPLACE FUNCTION simulate_xnova_combat(
  p_attackers jsonb,
  p_defenders jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_round integer := 0;
  v_max_rounds integer := 6;
  v_attacker_units jsonb;
  v_defender_units jsonb;
  v_result text := 'draw';
  v_attacker_losses_metal numeric := 0;
  v_attacker_losses_crystal numeric := 0;
  v_defender_losses_metal numeric := 0;
  v_defender_losses_crystal numeric := 0;
  v_debris_metal numeric := 0;
  v_debris_crystal numeric := 0;
  v_rounds_data jsonb := '[]'::jsonb;
  v_destroyed_defenses jsonb := '[]'::jsonb;
  v_initial_attackers jsonb;
  v_initial_defenders jsonb;
  v_attacker_count integer;
  v_defender_count integer;
  v_unit jsonb;
  v_target jsonb;
  v_target_idx integer;
  v_damage numeric;
  v_shield_absorbed numeric;
  v_hull_damage numeric;
  v_shots integer;
  v_i integer;
  v_j integer;
  v_new_attackers jsonb;
  v_new_defenders jsonb;
  v_round_attacker_losses jsonb;
  v_round_defender_losses jsonb;
BEGIN
  v_attacker_units := p_attackers;
  v_defender_units := p_defenders;
  v_initial_attackers := p_attackers;
  v_initial_defenders := p_defenders;

  SELECT COUNT(*) INTO v_defender_count 
  FROM jsonb_array_elements(v_defender_units) u 
  WHERE (u->>'quantity')::integer > 0;
  
  IF v_defender_count = 0 THEN
    RETURN jsonb_build_object(
      'result', 'attacker_won',
      'rounds', 0,
      'rounds_data', '[]'::jsonb,
      'attacker_remaining', v_attacker_units,
      'defender_remaining', '[]'::jsonb,
      'debris_metal', 0,
      'debris_crystal', 0,
      'attacker_losses_metal', 0,
      'attacker_losses_crystal', 0,
      'defender_losses_metal', 0,
      'defender_losses_crystal', 0,
      'destroyed_defenses', '[]'::jsonb,
      'initial_attacker', v_initial_attackers,
      'initial_defender', v_initial_defenders
    );
  END IF;

  WHILE v_round < v_max_rounds LOOP
    v_round := v_round + 1;
    v_round_attacker_losses := '[]'::jsonb;
    v_round_defender_losses := '[]'::jsonb;
    
    SELECT COUNT(*) INTO v_attacker_count 
    FROM jsonb_array_elements(v_attacker_units) u 
    WHERE (u->>'quantity')::integer > 0;
    
    SELECT COUNT(*) INTO v_defender_count 
    FROM jsonb_array_elements(v_defender_units) u 
    WHERE (u->>'quantity')::integer > 0;
    
    IF v_attacker_count = 0 OR v_defender_count = 0 THEN
      EXIT;
    END IF;

    v_new_defenders := v_defender_units;
    
    FOR v_i IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
      v_unit := v_attacker_units->v_i;
      
      IF (v_unit->>'quantity')::integer <= 0 THEN
        CONTINUE;
      END IF;
      
      FOR v_j IN 1..(v_unit->>'quantity')::integer LOOP
        SELECT COUNT(*) INTO v_defender_count 
        FROM jsonb_array_elements(v_new_defenders) u 
        WHERE (u->>'quantity')::integer > 0;
        
        IF v_defender_count = 0 THEN
          EXIT;
        END IF;
        
        v_target_idx := (random() * (jsonb_array_length(v_new_defenders) - 1))::integer;
        v_target := v_new_defenders->v_target_idx;
        
        WHILE (v_target->>'quantity')::integer <= 0 LOOP
          v_target_idx := (v_target_idx + 1) % jsonb_array_length(v_new_defenders);
          v_target := v_new_defenders->v_target_idx;
        END LOOP;
        
        v_shots := calculate_rapid_fire_shots(
          v_unit->>'code',
          v_target->>'code',
          v_unit->'rapid_fire'
        );
        
        v_damage := (v_unit->>'weapon')::numeric * v_shots;
        
        v_shield_absorbed := LEAST(v_damage, (v_target->>'current_shield')::numeric);
        v_hull_damage := v_damage - v_shield_absorbed;
        
        v_new_defenders := jsonb_set(
          v_new_defenders,
          ARRAY[v_target_idx::text, 'current_shield'],
          to_jsonb(GREATEST(0, (v_target->>'current_shield')::numeric - v_shield_absorbed))
        );
        
        IF v_hull_damage > 0 THEN
          DECLARE
            v_new_hull numeric;
            v_destroyed integer := 0;
            v_units_to_destroy integer;
            v_hull_per_unit numeric;
          BEGIN
            v_hull_per_unit := (v_target->>'hull')::numeric;
            v_new_hull := GREATEST(0, (v_target->>'current_hull')::numeric - v_hull_damage);
            
            IF v_new_hull <= 0 THEN
              v_units_to_destroy := CEIL(v_hull_damage / v_hull_per_unit);
              v_units_to_destroy := LEAST(v_units_to_destroy, (v_target->>'quantity')::integer);
              
              v_new_defenders := jsonb_set(
                v_new_defenders,
                ARRAY[v_target_idx::text, 'quantity'],
                to_jsonb(GREATEST(0, (v_target->>'quantity')::integer - v_units_to_destroy))
              );
              
              v_new_defenders := jsonb_set(
                v_new_defenders,
                ARRAY[v_target_idx::text, 'current_hull'],
                to_jsonb((v_target->>'hull')::numeric * GREATEST(0, (v_target->>'quantity')::integer - v_units_to_destroy))
              );
              
              v_new_defenders := jsonb_set(
                v_new_defenders,
                ARRAY[v_target_idx::text, 'current_shield'],
                to_jsonb((v_target->>'shield')::numeric * GREATEST(0, (v_target->>'quantity')::integer - v_units_to_destroy))
              );
              
              v_defender_losses_metal := v_defender_losses_metal + (v_units_to_destroy * (v_target->>'metal_cost')::numeric);
              v_defender_losses_crystal := v_defender_losses_crystal + (v_units_to_destroy * (v_target->>'crystal_cost')::numeric);
              
              IF (v_target->>'is_defense')::boolean THEN
                v_destroyed_defenses := v_destroyed_defenses || jsonb_build_object(
                  'defense_type_id', (v_target->>'type_id')::integer,
                  'quantity', v_units_to_destroy
                );
              END IF;
              
              v_round_defender_losses := v_round_defender_losses || jsonb_build_object(
                'name', v_target->>'name',
                'quantity', v_units_to_destroy
              );
            ELSE
              v_new_defenders := jsonb_set(
                v_new_defenders,
                ARRAY[v_target_idx::text, 'current_hull'],
                to_jsonb(v_new_hull)
              );
            END IF;
          END;
        END IF;
      END LOOP;
    END LOOP;
    
    v_defender_units := v_new_defenders;

    v_new_attackers := v_attacker_units;
    
    FOR v_i IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
      v_unit := v_defender_units->v_i;
      
      IF (v_unit->>'quantity')::integer <= 0 THEN
        CONTINUE;
      END IF;
      
      FOR v_j IN 1..(v_unit->>'quantity')::integer LOOP
        SELECT COUNT(*) INTO v_attacker_count 
        FROM jsonb_array_elements(v_new_attackers) u 
        WHERE (u->>'quantity')::integer > 0;
        
        IF v_attacker_count = 0 THEN
          EXIT;
        END IF;
        
        v_target_idx := (random() * (jsonb_array_length(v_new_attackers) - 1))::integer;
        v_target := v_new_attackers->v_target_idx;
        
        WHILE (v_target->>'quantity')::integer <= 0 LOOP
          v_target_idx := (v_target_idx + 1) % jsonb_array_length(v_new_attackers);
          v_target := v_new_attackers->v_target_idx;
        END LOOP;
        
        v_shots := calculate_rapid_fire_shots(
          v_unit->>'code',
          v_target->>'code',
          v_unit->'rapid_fire'
        );
        
        v_damage := (v_unit->>'weapon')::numeric * v_shots;
        
        v_shield_absorbed := LEAST(v_damage, (v_target->>'current_shield')::numeric);
        v_hull_damage := v_damage - v_shield_absorbed;
        
        v_new_attackers := jsonb_set(
          v_new_attackers,
          ARRAY[v_target_idx::text, 'current_shield'],
          to_jsonb(GREATEST(0, (v_target->>'current_shield')::numeric - v_shield_absorbed))
        );
        
        IF v_hull_damage > 0 THEN
          DECLARE
            v_new_hull numeric;
            v_units_to_destroy integer;
            v_hull_per_unit numeric;
          BEGIN
            v_hull_per_unit := (v_target->>'hull')::numeric;
            v_new_hull := GREATEST(0, (v_target->>'current_hull')::numeric - v_hull_damage);
            
            IF v_new_hull <= 0 THEN
              v_units_to_destroy := CEIL(v_hull_damage / v_hull_per_unit);
              v_units_to_destroy := LEAST(v_units_to_destroy, (v_target->>'quantity')::integer);
              
              v_new_attackers := jsonb_set(
                v_new_attackers,
                ARRAY[v_target_idx::text, 'quantity'],
                to_jsonb(GREATEST(0, (v_target->>'quantity')::integer - v_units_to_destroy))
              );
              
              v_new_attackers := jsonb_set(
                v_new_attackers,
                ARRAY[v_target_idx::text, 'current_hull'],
                to_jsonb((v_target->>'hull')::numeric * GREATEST(0, (v_target->>'quantity')::integer - v_units_to_destroy))
              );
              
              v_new_attackers := jsonb_set(
                v_new_attackers,
                ARRAY[v_target_idx::text, 'current_shield'],
                to_jsonb((v_target->>'shield')::numeric * GREATEST(0, (v_target->>'quantity')::integer - v_units_to_destroy))
              );
              
              v_attacker_losses_metal := v_attacker_losses_metal + (v_units_to_destroy * (v_target->>'metal_cost')::numeric);
              v_attacker_losses_crystal := v_attacker_losses_crystal + (v_units_to_destroy * (v_target->>'crystal_cost')::numeric);
              
              v_round_attacker_losses := v_round_attacker_losses || jsonb_build_object(
                'name', v_target->>'name',
                'quantity', v_units_to_destroy
              );
            ELSE
              v_new_attackers := jsonb_set(
                v_new_attackers,
                ARRAY[v_target_idx::text, 'current_hull'],
                to_jsonb(v_new_hull)
              );
            END IF;
          END;
        END IF;
      END LOOP;
    END LOOP;
    
    v_attacker_units := v_new_attackers;

    FOR v_i IN 0..(jsonb_array_length(v_attacker_units) - 1) LOOP
      v_unit := v_attacker_units->v_i;
      IF (v_unit->>'quantity')::integer > 0 THEN
        v_attacker_units := jsonb_set(
          v_attacker_units,
          ARRAY[v_i::text, 'current_shield'],
          to_jsonb((v_unit->>'shield')::numeric * (v_unit->>'quantity')::integer)
        );
      END IF;
    END LOOP;
    
    FOR v_i IN 0..(jsonb_array_length(v_defender_units) - 1) LOOP
      v_unit := v_defender_units->v_i;
      IF (v_unit->>'quantity')::integer > 0 THEN
        v_defender_units := jsonb_set(
          v_defender_units,
          ARRAY[v_i::text, 'current_shield'],
          to_jsonb((v_unit->>'shield')::numeric * (v_unit->>'quantity')::integer)
        );
      END IF;
    END LOOP;

    v_rounds_data := v_rounds_data || jsonb_build_object(
      'round', v_round,
      'attacker_losses', v_round_attacker_losses,
      'defender_losses', v_round_defender_losses
    );
  END LOOP;

  SELECT COUNT(*) INTO v_attacker_count 
  FROM jsonb_array_elements(v_attacker_units) u 
  WHERE (u->>'quantity')::integer > 0;
  
  SELECT COUNT(*) INTO v_defender_count 
  FROM jsonb_array_elements(v_defender_units) u 
  WHERE (u->>'quantity')::integer > 0;

  IF v_attacker_count > 0 AND v_defender_count = 0 THEN
    v_result := 'attacker_won';
  ELSIF v_attacker_count = 0 AND v_defender_count > 0 THEN
    v_result := 'defender_won';
  ELSE
    v_result := 'draw';
  END IF;

  v_debris_metal := FLOOR((v_attacker_losses_metal + v_defender_losses_metal) * 0.3);
  v_debris_crystal := FLOOR((v_attacker_losses_crystal + v_defender_losses_crystal) * 0.3);

  RETURN jsonb_build_object(
    'result', v_result,
    'rounds', v_round,
    'rounds_data', v_rounds_data,
    'attacker_remaining', v_attacker_units,
    'defender_remaining', v_defender_units,
    'debris_metal', v_debris_metal,
    'debris_crystal', v_debris_crystal,
    'attacker_losses_metal', v_attacker_losses_metal,
    'attacker_losses_crystal', v_attacker_losses_crystal,
    'defender_losses_metal', v_defender_losses_metal,
    'defender_losses_crystal', v_defender_losses_crystal,
    'destroyed_defenses', v_destroyed_defenses,
    'initial_attacker', v_initial_attackers,
    'initial_defender', v_initial_defenders
  );
END;
$$;

-- =============================================================================
-- SECTION 3: Updated perform_combat_acs with tech bonuses and rapid fire
-- =============================================================================

CREATE OR REPLACE FUNCTION perform_combat_acs(p_acs_id uuid, p_target_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_attacker_units jsonb := '[]'::jsonb;
  v_defender_units jsonb := '[]'::jsonb;
  v_combat_result jsonb;
  v_fleet_record record;
  v_ship_record record;
  v_defense_record record;
  v_defender_id uuid;
  v_weapon_bonus numeric;
  v_shield_bonus numeric;
  v_hull_bonus numeric;
  v_weapon numeric;
  v_shield numeric;
  v_hull numeric;
  v_total_cargo bigint := 0;
  v_fleet_distributions jsonb := '[]'::jsonb;
  v_fleet_cargo bigint;
BEGIN
  SELECT user_id INTO v_defender_id FROM planets WHERE id = p_target_planet_id;

  FOR v_fleet_record IN
    SELECT f.id as fleet_id, f.user_id
    FROM fleets f
    JOIN acs_participants ap ON ap.fleet_id = f.id
    WHERE ap.acs_id = p_acs_id 
    AND f.is_completed = false 
    AND f.is_returning = false
  LOOP
    SELECT 
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_fleet_record.user_id AND tt.code = 'weapons_tech'), 0),
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_fleet_record.user_id AND tt.code = 'shielding_tech'), 0),
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_fleet_record.user_id AND tt.code = 'armour_tech'), 0)
    INTO v_weapon_bonus, v_shield_bonus, v_hull_bonus;

    v_fleet_cargo := 0;
    
    FOR v_ship_record IN
      SELECT fs.ship_type_id, fs.quantity, st.code, st.name, st.weapon_power, st.shield_power,
             st.structural_integrity, st.metal_cost, st.crystal_cost, st.cargo_capacity, st.rapid_fire
      FROM fleet_ships fs
      JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = v_fleet_record.fleet_id AND fs.quantity > 0
    LOOP
      v_weapon := FLOOR(v_ship_record.weapon_power * (1 + v_weapon_bonus * 0.10));
      v_shield := FLOOR(v_ship_record.shield_power * (1 + v_shield_bonus * 0.10));
      v_hull := FLOOR(v_ship_record.structural_integrity * (1 + v_hull_bonus * 0.10));
      
      v_fleet_cargo := v_fleet_cargo + (v_ship_record.quantity * v_ship_record.cargo_capacity);

      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_attacker_units) AS elem
        WHERE (elem->>'code') = v_ship_record.code
      ) THEN
        v_attacker_units := (
          SELECT jsonb_agg(
            CASE
              WHEN (elem->>'code') = v_ship_record.code THEN
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(elem, '{quantity}', to_jsonb((elem->>'quantity')::integer + v_ship_record.quantity)),
                      '{initial_quantity}', to_jsonb((elem->>'initial_quantity')::integer + v_ship_record.quantity)
                    ),
                    '{current_hull}', to_jsonb((elem->>'current_hull')::numeric + (v_hull * v_ship_record.quantity))
                  ),
                  '{current_shield}', to_jsonb((elem->>'current_shield')::numeric + (v_shield * v_ship_record.quantity))
                )
              ELSE elem
            END
          )
          FROM jsonb_array_elements(v_attacker_units) AS elem
        );
      ELSE
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
          'cargo_capacity', v_ship_record.cargo_capacity,
          'rapid_fire', COALESCE(v_ship_record.rapid_fire, '{}'::jsonb),
          'is_defense', false
        );
      END IF;
    END LOOP;

    v_total_cargo := v_total_cargo + v_fleet_cargo;
    
    v_fleet_distributions := v_fleet_distributions || jsonb_build_object(
      'fleet_id', v_fleet_record.fleet_id,
      'user_id', v_fleet_record.user_id,
      'cargo_capacity', v_fleet_cargo
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

  IF v_total_cargo > 0 THEN
    v_fleet_distributions := (
      SELECT jsonb_agg(
        jsonb_set(elem, '{cargo_ratio}', to_jsonb((elem->>'cargo_capacity')::numeric / v_total_cargo))
      )
      FROM jsonb_array_elements(v_fleet_distributions) AS elem
    );
  END IF;

  RETURN jsonb_set(
    jsonb_set(v_combat_result, '{total_cargo_capacity}', to_jsonb(v_total_cargo)),
    '{fleet_distributions}', v_fleet_distributions
  );
END;
$$;

-- =============================================================================
-- SECTION 4: Updated regular perform_combat with rapid fire
-- =============================================================================

CREATE OR REPLACE FUNCTION perform_combat(p_attacker_fleet_id uuid, p_target_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_attacker_units jsonb := '[]'::jsonb;
  v_defender_units jsonb := '[]'::jsonb;
  v_combat_result jsonb;
  v_ship_record record;
  v_defense_record record;
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
      'is_defense', false
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

  RETURN v_combat_result;
END;
$$;

-- =============================================================================
-- SECTION 5: Function to create ACS attack from existing fleet
-- =============================================================================

CREATE OR REPLACE FUNCTION create_acs_from_fleet(
  p_fleet_id uuid,
  p_acs_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_fleet record;
  v_alliance_id uuid;
  v_acs_id uuid;
  v_acs_name text;
BEGIN
  SELECT * INTO v_fleet FROM fleets 
  WHERE id = p_fleet_id 
  AND user_id = auth.uid() 
  AND mission_type = 'attack'
  AND is_returning = false 
  AND is_completed = false;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada o no es una mision de ataque valida');
  END IF;

  IF v_fleet.acs_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta flota ya forma parte de un ACS');
  END IF;

  SELECT alliance_id INTO v_alliance_id FROM alliance_members WHERE user_id = auth.uid();
  IF v_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes ser miembro de una alianza para crear un ataque ACS');
  END IF;

  v_acs_name := COALESCE(p_acs_name, 'ACS-' || substr(p_fleet_id::text, 1, 8));

  INSERT INTO acs_fleets (
    main_fleet_id, alliance_id, name, 
    target_galaxy, target_system, target_position,
    arrival_time, max_fleets, is_active, status, invited_users
  ) VALUES (
    p_fleet_id, v_alliance_id, v_acs_name,
    v_fleet.target_galaxy, v_fleet.target_system, v_fleet.target_position,
    v_fleet.arrival_time, 5, true, 'waiting', ARRAY[]::uuid[]
  ) RETURNING id INTO v_acs_id;

  UPDATE fleets SET acs_id = v_acs_id, is_acs = true WHERE id = p_fleet_id;

  INSERT INTO acs_participants (acs_id, fleet_id, user_id)
  VALUES (v_acs_id, p_fleet_id, auth.uid());

  RETURN jsonb_build_object(
    'success', true, 
    'acs_id', v_acs_id,
    'message', format('Ataque ACS "%s" creado exitosamente', v_acs_name)
  );
END;
$$;

-- =============================================================================
-- SECTION 6: Function to join existing ACS attack
-- =============================================================================

CREATE OR REPLACE FUNCTION join_acs_attack(
  p_acs_id uuid,
  p_fleet_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_acs record;
  v_fleet record;
  v_user_alliance_id uuid;
  v_current_participants integer;
  v_new_arrival_time timestamptz;
BEGIN
  SELECT * INTO v_acs FROM acs_fleets WHERE id = p_acs_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ataque ACS no encontrado o ya no esta activo');
  END IF;

  SELECT * INTO v_fleet FROM fleets 
  WHERE id = p_fleet_id 
  AND user_id = auth.uid()
  AND mission_type = 'attack'
  AND is_returning = false 
  AND is_completed = false;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada o no es una mision de ataque valida');
  END IF;

  IF v_fleet.target_galaxy != v_acs.target_galaxy OR 
     v_fleet.target_system != v_acs.target_system OR 
     v_fleet.target_position != v_acs.target_position THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota debe tener el mismo objetivo que el ACS');
  END IF;

  IF v_fleet.acs_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta flota ya forma parte de otro ACS');
  END IF;

  SELECT alliance_id INTO v_user_alliance_id FROM alliance_members WHERE user_id = auth.uid();
  
  IF v_user_alliance_id IS NULL OR v_user_alliance_id != v_acs.alliance_id THEN
    IF NOT (auth.uid() = ANY(v_acs.invited_users)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para unirte a este ACS');
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_current_participants FROM acs_participants WHERE acs_id = p_acs_id;
  IF v_current_participants >= v_acs.max_fleets THEN
    RETURN jsonb_build_object('success', false, 'error', format('El ACS ya tiene el maximo de %s flotas', v_acs.max_fleets));
  END IF;

  IF EXISTS (SELECT 1 FROM acs_participants WHERE acs_id = p_acs_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una flota en este ACS');
  END IF;

  v_new_arrival_time := GREATEST(v_acs.arrival_time, v_fleet.arrival_time);
  
  IF v_new_arrival_time > v_acs.arrival_time THEN
    UPDATE acs_fleets SET arrival_time = v_new_arrival_time WHERE id = p_acs_id;
    
    UPDATE fleets f SET arrival_time = v_new_arrival_time
    FROM acs_participants ap
    WHERE ap.acs_id = p_acs_id AND f.id = ap.fleet_id;
  END IF;

  UPDATE fleets SET 
    acs_id = p_acs_id, 
    is_acs = true,
    arrival_time = v_new_arrival_time
  WHERE id = p_fleet_id;

  INSERT INTO acs_participants (acs_id, fleet_id, user_id)
  VALUES (p_acs_id, p_fleet_id, auth.uid());

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Te has unido al ataque ACS "%s"', v_acs.name),
    'new_arrival_time', v_new_arrival_time
  );
END;
$$;

-- =============================================================================
-- SECTION 7: Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION calculate_rapid_fire_shots(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION simulate_xnova_combat(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION perform_combat_acs(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION perform_combat(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_acs_from_fleet(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_acs_attack(uuid, uuid) TO authenticated;
