/*
  # Enable Alliance Hold (Defend) Mission via Alliance Depot

  1. Changes
    - Updates `validate_fleet_mission` to allow 'deploy' on ally planets
      that have alliance_depot level >= 1
    - Updates `perform_combat` to include allied stationed fleets as defenders
      with 'source' tags so post-combat can route losses correctly
    - Updates `process_fleet_arrival` deploy handler to keep allied fleets
      stationed (not merge into planet_ships) and combat handler to process
      allied fleet losses from 'source' field

  2. Safety
    - CREATE OR REPLACE on existing functions (same name, same parameters)
    - No tables, columns or names changed
    - Only adds conditions inside existing IF blocks
    - All other mission validations remain untouched
    - 'source' field is extra jsonb metadata: simulate_xnova_combat passes
      it through transparently (does not filter unknown fields)

  3. Logic
    - Deploy on ally planet: target must be in same alliance AND have
      alliance_depot building level >= 1
    - Deploy arrival: own planets → merge ships into planet_ships (as before)
      ally planets → fleet stays stationed (is_completed=false, is_returning=false)
    - Combat: allied fleets stationed on target planet fight as defenders
      using their owner's tech bonuses. Each unit tagged with source to
      correctly apply losses after combat
*/

-- ============================================
-- 1. UPDATE validate_fleet_mission: allow deploy on ally planets with depot
-- ============================================
CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_planet record;
  v_protection_check jsonb;
  v_bashing_check jsonb;
  v_max_colonies integer;
  v_current_colonies integer;
  v_astrophysics_level integer;
  v_attacker_vacation boolean;
  v_hostile_missions text[] := ARRAY['attack', 'espionage', 'destroy'];
  v_expedition_result jsonb;
  v_user_alliance_id uuid;
  v_target_alliance_id uuid;
  v_depot_level integer;
BEGIN
  -- Check vacation mode for attacker
  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;
  
  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
    );
  END IF;

  -- Get target planet if exists
  SELECT p.*, pr.id as owner_id, pr.vacation_mode as target_vacation_mode 
  INTO v_target_planet
  FROM planets p
  LEFT JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = 'planet'
    AND NOT p.is_destroyed;

  -- Check vacation mode for defender
  IF v_target_planet IS NOT NULL 
     AND v_target_planet.target_vacation_mode = true 
     AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes atacar a jugadores en modo vacaciones'
    );
  END IF;

  -- ===========================================
  -- COLONIZE MISSION
  -- ===========================================
  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'La posicion ya esta ocupada');
    END IF;

    SELECT COUNT(*) INTO v_current_colonies
    FROM planets WHERE user_id = p_user_id AND NOT is_destroyed;

    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

    v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

    IF v_current_colonies >= v_max_colonies THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica.', v_max_colonies)
      );
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================
  -- EXPEDITION MISSION: Check position 16 AND charge FXU fee
  -- ===========================================
  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;
    
    -- Check and charge expedition fee
    v_expedition_result := charge_expedition_fee(p_user_id);
    
    IF NOT (v_expedition_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', v_expedition_result->>'error',
        'expedition_fee_required', (v_expedition_result->>'required_fee')::numeric,
        'current_fxu', (v_expedition_result->>'current_balance')::numeric
      );
    END IF;
    
    RETURN jsonb_build_object(
      'valid', true,
      'expedition_charged', (v_expedition_result->>'charged')::boolean,
      'expedition_fee', (v_expedition_result->>'fee')::numeric,
      'expedition_number', (v_expedition_result->>'expedition_number')::integer
    );
  END IF;

  -- ===========================================
  -- ATTACK / ESPIONAGE / DESTROY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('attack', 'espionage', 'destroy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tus propios planetas');
    END IF;

    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'can_attack')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    IF p_mission_type = 'attack' THEN
      v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;
  END IF;

  -- ===========================================
  -- TRANSPORT / DEPLOY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('transport', 'deploy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF p_mission_type = 'deploy' AND v_target_planet.user_id != p_user_id THEN
      -- Allow deploy on ally planets if they have alliance_depot >= 1
      SELECT alliance_id INTO v_user_alliance_id FROM alliance_members WHERE user_id = p_user_id;
      SELECT alliance_id INTO v_target_alliance_id FROM alliance_members WHERE user_id = v_target_planet.user_id;

      IF v_user_alliance_id IS NULL OR v_target_alliance_id IS NULL OR v_user_alliance_id != v_target_alliance_id THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes estacionar en planetas de tu alianza');
      END IF;

      -- Check alliance_depot level on target planet
      SELECT COALESCE(pb.level, 0) INTO v_depot_level
      FROM planet_buildings pb
      JOIN building_types bt ON pb.building_type_id = bt.id
      WHERE pb.planet_id = v_target_planet.id AND bt.code = 'alliance_depot';

      IF COALESCE(v_depot_level, 0) < 1 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'El planeta aliado necesita Deposito de Alianza nivel 1 o superior');
      END IF;
    END IF;
  END IF;

  -- ===========================================
  -- RECYCLE MISSION
  -- ===========================================
  IF p_mission_type = 'recycle' THEN
    IF NOT EXISTS (
      SELECT 1 FROM debris_fields
      WHERE galaxy = p_target_galaxy
        AND solar_system = p_target_system
        AND position = p_target_position
        AND (metal > 0 OR crystal > 0)
    ) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay campo de escombros en esas coordenadas');
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- ============================================
-- 2. UPDATE perform_combat: include allied stationed fleets as defenders
--    with 'source' tag on every unit for post-combat loss routing
-- ============================================
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

  -- === ALLIED STATIONED FLEETS (deployed on this planet) ===
  FOR v_allied_fleet IN
    SELECT f.id as fleet_id, f.user_id as ally_user_id
    FROM fleets f
    WHERE f.target_galaxy = (SELECT galaxy FROM planets WHERE id = p_target_planet_id)
      AND f.target_system = (SELECT solar_system FROM planets WHERE id = p_target_planet_id)
      AND f.target_position = (SELECT position FROM planets WHERE id = p_target_planet_id)
      AND f.mission_type = 'deploy'
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
$$;

-- ============================================
-- 3. UPDATE process_fleet_arrival:
--    - Deploy handler: support ally planets (fleet stays stationed)
--    - Combat handler: route allied fleet losses via 'source' field
-- ============================================
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  fleet_record RECORD;
  target_planet RECORD;
  ship_record RECORD;
  total_cargo_capacity INTEGER;
  loot_metal NUMERIC;
  loot_crystal NUMERIC;
  loot_deuterium NUMERIC;
  combat_result jsonb;
  v_unit jsonb;
  v_debris_metal NUMERIC := 0;
  v_debris_crystal NUMERIC := 0;
  v_dark_matter_found INTEGER := 0;
  v_expedition_message TEXT;
  v_attacker_units_report TEXT;
  v_defender_units_report TEXT;
  v_all_acs_fleets_arrived BOOLEAN;
  v_expedition_result jsonb;
  v_colonization_success BOOLEAN := false;
  v_attacker_name TEXT;
  v_origin_coords TEXT;
  v_moon_result jsonb;
  v_moon_text TEXT := '';
  v_planet_metal NUMERIC;
  v_planet_crystal NUMERIC;
  v_planet_deuterium NUMERIC;
  v_unit_source TEXT;
  v_allied_fleet_id uuid;
BEGIN
  SELECT * INTO fleet_record
  FROM fleets
  WHERE id = p_fleet_id
  AND is_completed = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF fleet_record.arrival_time > NOW() AND NOT fleet_record.is_returning THEN
    RETURN;
  END IF;

  IF fleet_record.is_returning AND fleet_record.return_time > NOW() THEN
    RETURN;
  END IF;

  IF fleet_record.is_acs AND fleet_record.acs_id IS NOT NULL AND NOT fleet_record.is_returning THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM fleets f
      WHERE f.acs_id = fleet_record.acs_id
      AND f.arrival_time > NOW()
      AND NOT f.is_returning
      AND NOT f.is_completed
    ) INTO v_all_acs_fleets_arrived;

    IF v_all_acs_fleets_arrived THEN
      PERFORM process_acs_fleet_arrival(fleet_record.acs_id);
    END IF;
    RETURN;
  END IF;

  IF fleet_record.is_returning THEN
    FOR ship_record IN
      SELECT fs.ship_type_id, fs.quantity
      FROM fleet_ships fs
      WHERE fs.fleet_id = p_fleet_id
    LOOP
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (fleet_record.origin_planet_id, ship_record.ship_type_id, ship_record.quantity)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
    END LOOP;

    UPDATE planet_resources
    SET metal = metal + fleet_record.cargo_metal,
        crystal = crystal + fleet_record.cargo_crystal,
        deuterium = deuterium + fleet_record.cargo_deuterium
    WHERE planet_id = fleet_record.origin_planet_id;

    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;

    UPDATE fleets
    SET is_completed = true,
        acs_id = NULL,
        is_acs = false
    WHERE id = p_fleet_id;

    RETURN;
  END IF;

  CASE fleet_record.mission_type

  WHEN 'attack' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position;

    IF FOUND AND target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
      combat_result := perform_combat(p_fleet_id, target_planet.id);

      v_attacker_units_report := format_unit_report(combat_result->'initial_attacker', combat_result->'attacker_remaining', 'attacker');
      v_defender_units_report := format_unit_report(combat_result->'initial_defender', combat_result->'defender_remaining', 'defender');

      SELECT username INTO v_attacker_name FROM profiles WHERE id = fleet_record.user_id;
      SELECT format('[%s:%s:%s]', p.galaxy, p.solar_system, p.position) INTO v_origin_coords
      FROM planets p WHERE p.id = fleet_record.origin_planet_id;

      IF (combat_result->>'result') = 'attacker_won' THEN
        SELECT COALESCE(SUM((unit->>'quantity')::integer * (SELECT cargo_capacity FROM ship_types WHERE id = (unit->>'type_id')::integer)), 0)
        INTO total_cargo_capacity
        FROM jsonb_array_elements(combat_result->'attacker_remaining') AS unit
        WHERE (unit->>'quantity')::integer > 0;

        SELECT metal, crystal, deuterium
        INTO v_planet_metal, v_planet_crystal, v_planet_deuterium
        FROM planet_resources WHERE planet_id = target_planet.id;

        SELECT cl.looted_metal, cl.looted_crystal, cl.looted_deuterium
        INTO loot_metal, loot_crystal, loot_deuterium
        FROM calculate_loot(v_planet_metal, v_planet_crystal, v_planet_deuterium, total_cargo_capacity) cl;

        UPDATE planet_resources
        SET metal = GREATEST(0, metal - loot_metal),
            crystal = GREATEST(0, crystal - loot_crystal),
            deuterium = GREATEST(0, deuterium - loot_deuterium)
        WHERE planet_id = target_planet.id;

        UPDATE fleets
        SET cargo_metal = cargo_metal + loot_metal,
            cargo_crystal = cargo_crystal + loot_crystal,
            cargo_deuterium = cargo_deuterium + loot_deuterium
        WHERE id = p_fleet_id;

        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining') LOOP
          IF (v_unit->>'quantity')::integer > 0 THEN
            INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
            VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer);
          END IF;
        END LOOP;

        -- Defender remaining: route by source
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
          v_unit_source := COALESCE(v_unit->>'source', 'planet');
          IF (v_unit->>'is_defense')::boolean OR v_unit_source = 'defense' THEN
            -- Defense units: skip here, handled by destroyed_defenses below
            NULL;
          ELSIF v_unit_source = 'planet' THEN
            -- Planet owner ships
            UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
          ELSE
            -- Allied fleet ships: source is the fleet_id
            v_allied_fleet_id := v_unit_source::uuid;
            UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer
            WHERE fleet_id = v_allied_fleet_id AND ship_type_id = (v_unit->>'type_id')::integer;
            -- If allied fleet lost all ships of this type, remove the row
            DELETE FROM fleet_ships WHERE fleet_id = v_allied_fleet_id AND ship_type_id = (v_unit->>'type_id')::integer AND quantity <= 0;
            -- If allied fleet has no ships left, mark it completed
            IF NOT EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = v_allied_fleet_id AND quantity > 0) THEN
              UPDATE fleets SET is_completed = true WHERE id = v_allied_fleet_id;
            END IF;
          END IF;
        END LOOP;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP
          DECLARE
            v_destroyed_qty INTEGER := (v_unit->>'quantity')::integer;
            v_rebuilt_qty INTEGER := 0;
            v_i INTEGER;
          BEGIN
            FOR v_i IN 1..v_destroyed_qty LOOP
              IF random() < 0.7 THEN v_rebuilt_qty := v_rebuilt_qty + 1; END IF;
            END LOOP;
            UPDATE planet_defenses
            SET quantity = GREATEST(0, quantity - v_destroyed_qty + v_rebuilt_qty)
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
          END;
        END LOOP;

        UPDATE profiles
        SET battles_won = battles_won + 1,
            units_destroyed = units_destroyed + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0)
        WHERE id = fleet_record.user_id;
        UPDATE profiles
        SET battles_lost = battles_lost + 1,
            units_lost = units_lost + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0)
        WHERE id = target_planet.user_id;

      ELSIF (combat_result->>'result') = 'defender_won' THEN
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;

        -- Defender remaining: route by source
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
          v_unit_source := COALESCE(v_unit->>'source', 'planet');
          IF (v_unit->>'is_defense')::boolean OR v_unit_source = 'defense' THEN
            UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
          ELSIF v_unit_source = 'planet' THEN
            UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
          ELSE
            -- Allied fleet ships
            v_allied_fleet_id := v_unit_source::uuid;
            UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer
            WHERE fleet_id = v_allied_fleet_id AND ship_type_id = (v_unit->>'type_id')::integer;
            DELETE FROM fleet_ships WHERE fleet_id = v_allied_fleet_id AND ship_type_id = (v_unit->>'type_id')::integer AND quantity <= 0;
            IF NOT EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = v_allied_fleet_id AND quantity > 0) THEN
              UPDATE fleets SET is_completed = true WHERE id = v_allied_fleet_id;
            END IF;
          END IF;
        END LOOP;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP
          DECLARE
            v_destroyed_qty INTEGER := (v_unit->>'quantity')::integer;
            v_rebuilt_qty INTEGER := 0;
            v_i INTEGER;
          BEGIN
            FOR v_i IN 1..v_destroyed_qty LOOP
              IF random() < 0.7 THEN v_rebuilt_qty := v_rebuilt_qty + 1; END IF;
            END LOOP;
            UPDATE planet_defenses SET quantity = quantity + v_rebuilt_qty
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
          END;
        END LOOP;

        UPDATE profiles SET battles_lost = battles_lost + 1 WHERE id = fleet_record.user_id;
        UPDATE profiles SET battles_won = battles_won + 1 WHERE id = target_planet.user_id;
        loot_metal := 0; loot_crystal := 0; loot_deuterium := 0;

      ELSE
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining') LOOP
          IF (v_unit->>'quantity')::integer > 0 THEN
            INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
            VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer);
          END IF;
        END LOOP;

        -- Defender remaining: route by source
        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
          v_unit_source := COALESCE(v_unit->>'source', 'planet');
          IF (v_unit->>'is_defense')::boolean OR v_unit_source = 'defense' THEN
            UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
          ELSIF v_unit_source = 'planet' THEN
            UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
          ELSE
            -- Allied fleet ships
            v_allied_fleet_id := v_unit_source::uuid;
            UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer
            WHERE fleet_id = v_allied_fleet_id AND ship_type_id = (v_unit->>'type_id')::integer;
            DELETE FROM fleet_ships WHERE fleet_id = v_allied_fleet_id AND ship_type_id = (v_unit->>'type_id')::integer AND quantity <= 0;
            IF NOT EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = v_allied_fleet_id AND quantity > 0) THEN
              UPDATE fleets SET is_completed = true WHERE id = v_allied_fleet_id;
            END IF;
          END IF;
        END LOOP;

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP
          DECLARE
            v_destroyed_qty INTEGER := (v_unit->>'quantity')::integer;
            v_rebuilt_qty INTEGER := 0;
            v_i INTEGER;
          BEGIN
            FOR v_i IN 1..v_destroyed_qty LOOP
              IF random() < 0.7 THEN v_rebuilt_qty := v_rebuilt_qty + 1; END IF;
            END LOOP;
            UPDATE planet_defenses SET quantity = quantity + v_rebuilt_qty
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
          END;
        END LOOP;

        UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = fleet_record.user_id;
        UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = target_planet.user_id;
        loot_metal := 0; loot_crystal := 0; loot_deuterium := 0;
      END IF;

      v_debris_metal := COALESCE((combat_result->>'debris_metal')::numeric, 0);
      v_debris_crystal := COALESCE((combat_result->>'debris_crystal')::numeric, 0);

      IF v_debris_metal > 0 OR v_debris_crystal > 0 THEN
        INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal)
        VALUES (fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, v_debris_metal, v_debris_crystal)
        ON CONFLICT (galaxy, solar_system, position)
        DO UPDATE SET metal = debris_fields.metal + EXCLUDED.metal, crystal = debris_fields.crystal + EXCLUDED.crystal, updated_at = NOW();

        UPDATE profiles
        SET debris_metal_total = debris_metal_total + v_debris_metal,
            debris_crystal_total = debris_crystal_total + v_debris_crystal
        WHERE id = fleet_record.user_id;

        UPDATE profiles
        SET debris_metal_total = debris_metal_total + v_debris_metal,
            debris_crystal_total = debris_crystal_total + v_debris_crystal
        WHERE id = target_planet.user_id;
      END IF;

      v_moon_result := check_moon_creation(
        fleet_record.target_galaxy,
        fleet_record.target_system,
        fleet_record.target_position,
        v_debris_metal,
        v_debris_crystal
      );

      IF (v_moon_result->>'moon_created')::boolean THEN
        v_moon_text := format(E'\n\nUna luna de %s km de diametro se ha formado a partir de los escombros! (Probabilidad: %s%%)',
          (v_moon_result->>'moon_diameter')::integer,
          ROUND((v_moon_result->>'moon_chance')::numeric, 1));
      ELSE
        v_moon_text := format(E'\n\nProbabilidad de luna: %s%% - No se formo ninguna luna.',
          ROUND(COALESCE((v_moon_result->>'moon_chance')::numeric, 0), 1));
      END IF;

      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
      VALUES (NULL, fleet_record.user_id,
        format('Reporte de Combate - %s', CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'Victoria' WHEN 'defender_won' THEN 'Derrota' ELSE 'Empate' END),
        format(E'Combate en %s [%s:%s:%s]\n\nResultado: %s\nRondas: %s\n\n=== TUS FUERZAS ===\n%s\n\n=== FUERZAS ENEMIGAS ===\n%s\n\nBotin: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nPerdidas del atacante: %s Metal, %s Cristal\nPerdidas del defensor: %s Metal, %s Cristal',
          target_planet.name, fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
          CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'VICTORIA' WHEN 'defender_won' THEN 'DERROTA' ELSE 'EMPATE' END,
          (combat_result->>'rounds'), v_attacker_units_report, v_defender_units_report,
          floor(COALESCE(loot_metal, 0)), floor(COALESCE(loot_crystal, 0)), floor(COALESCE(loot_deuterium, 0)),
          floor(v_debris_metal), floor(v_debris_crystal),
          floor(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0)),
          floor(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0)))
        || v_moon_text,
        'battle');

      INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
      VALUES (NULL, target_planet.user_id,
        format('Tu planeta %s fue atacado por %s - %s', target_planet.name, COALESCE(v_attacker_name, 'Desconocido'), CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'Derrota' WHEN 'defender_won' THEN 'Victoria' ELSE 'Empate' END),
        format(E'Tu planeta %s en [%s:%s:%s] fue atacado por %s desde %s.\n\nResultado: %s\nRondas: %s\n\n=== TUS FUERZAS ===\n%s\n\n=== FUERZAS ATACANTES ===\n%s\n\nRecursos saqueados: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nTus perdidas: %s Metal, %s Cristal\nPerdidas del atacante: %s Metal, %s Cristal\n\nLas defensas destruidas tienen 70%% de probabilidad de ser reconstruidas automaticamente.',
          target_planet.name, fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
          COALESCE(v_attacker_name, 'Desconocido'), COALESCE(v_origin_coords, ''),
          CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'DERROTA' WHEN 'defender_won' THEN 'VICTORIA' ELSE 'EMPATE' END,
          (combat_result->>'rounds'), v_defender_units_report, v_attacker_units_report,
          floor(COALESCE(loot_metal, 0)), floor(COALESCE(loot_crystal, 0)), floor(COALESCE(loot_deuterium, 0)),
          floor(v_debris_metal), floor(v_debris_crystal),
          floor(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0)),
          floor(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0)))
        || v_moon_text,
        'battle');

      IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      ELSE
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
      END IF;
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;

  WHEN 'transport' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position;

    IF FOUND THEN
      UPDATE planet_resources
      SET metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
      WHERE planet_id = target_planet.id;

      UPDATE fleets
      SET cargo_metal = 0, cargo_crystal = 0, cargo_deuterium = 0, is_returning = true
      WHERE id = p_fleet_id;
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;

  WHEN 'deploy' THEN
    -- First try own planet (original behavior)
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position
    AND p.user_id = fleet_record.user_id;

    IF FOUND THEN
      -- Own planet: merge ships into planet_ships and complete fleet
      FOR ship_record IN SELECT fs.ship_type_id, fs.quantity FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id LOOP
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES (target_planet.id, ship_record.ship_type_id, ship_record.quantity)
        ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
      END LOOP;

      UPDATE planet_resources
      SET metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
      WHERE planet_id = target_planet.id;

      DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
      UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    ELSE
      -- Check if ally planet with alliance_depot (fleet stays stationed)
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position
      AND p.user_id IS NOT NULL
      AND p.user_id != fleet_record.user_id;

      IF FOUND THEN
        -- Ally planet: fleet stays stationed, do NOT merge into planet_ships
        -- Deposit cargo resources to ally planet
        UPDATE planet_resources
        SET metal = metal + fleet_record.cargo_metal,
            crystal = crystal + fleet_record.cargo_crystal,
            deuterium = deuterium + fleet_record.cargo_deuterium
        WHERE planet_id = target_planet.id;

        UPDATE fleets
        SET cargo_metal = 0, cargo_crystal = 0, cargo_deuterium = 0
        WHERE id = p_fleet_id;
        -- Fleet stays: is_completed = false, is_returning = false
        -- Ships remain in fleet_ships for combat participation
      ELSE
        -- Planet not found or abandoned: return home
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;
    END IF;

  WHEN 'espionage' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position
    AND p.planet_type = 'planet';

    IF FOUND AND target_planet.user_id IS NOT NULL THEN
      PERFORM generate_espionage_report(fleet_record.user_id, target_planet.id, target_planet.user_id);
    END IF;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  WHEN 'recycle' THEN
    DECLARE
      debris RECORD;
      recycler_capacity INTEGER;
      collected_metal NUMERIC;
      collected_crystal NUMERIC;
    BEGIN
      SELECT * INTO debris
      FROM debris_fields
      WHERE galaxy = fleet_record.target_galaxy
      AND solar_system = fleet_record.target_system
      AND position = fleet_record.target_position;

      IF FOUND AND (debris.metal > 0 OR debris.crystal > 0) THEN
        SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0) INTO recycler_capacity
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id AND st.code = 'recycler';

        collected_metal := LEAST(debris.metal, recycler_capacity / 2);
        collected_crystal := LEAST(debris.crystal, recycler_capacity / 2);

        UPDATE debris_fields
        SET metal = metal - collected_metal, crystal = crystal - collected_crystal, updated_at = NOW()
        WHERE id = debris.id;

        DELETE FROM debris_fields WHERE id = debris.id AND metal <= 0 AND crystal <= 0;

        UPDATE fleets
        SET cargo_metal = cargo_metal + collected_metal,
            cargo_crystal = cargo_crystal + collected_crystal,
            is_returning = true
        WHERE id = p_fleet_id;

        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (NULL, fleet_record.user_id, 'Reporte de Reciclaje',
          format('Tus recicladores han recogido %s Metal y %s Cristal de los escombros en [%s:%s:%s].',
            floor(collected_metal), floor(collected_crystal),
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
          'system');
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (NULL, fleet_record.user_id, 'Reciclaje Fallido',
          format('No se encontraron escombros en [%s:%s:%s].',
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
          'system');
      END IF;
    END;

  WHEN 'colonize' THEN
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position;

    IF NOT FOUND THEN
      DECLARE
        colony_ship_type_id INTEGER;
        has_colony_ship BOOLEAN;
        new_planet_id uuid;
        v_colony_ship_quantity INTEGER;
        v_cargo_metal NUMERIC;
        v_cargo_crystal NUMERIC;
        v_cargo_deuterium NUMERIC;
        v_remaining_ships INTEGER;
        v_current_colonies INTEGER;
        v_astrophysics_level INTEGER;
        v_max_colonies INTEGER;
      BEGIN
        SELECT COUNT(*) INTO v_current_colonies
        FROM planets WHERE user_id = fleet_record.user_id AND NOT is_destroyed;

        SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
        FROM user_technologies ut
        JOIN technology_types tt ON ut.technology_type_id = tt.id
        WHERE ut.user_id = fleet_record.user_id AND tt.code = 'astrophysics';

        v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

        IF v_current_colonies >= v_max_colonies THEN
          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
          VALUES (NULL, fleet_record.user_id, 'Colonizacion Fallida',
            format('Tu flota llego a [%s:%s:%s] pero no pudo colonizar. Ya tienes el maximo de colonias permitido (%s). Investiga Astrofisica para aumentar el limite. La flota regresa al planeta de origen.',
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, v_max_colonies),
            'system');

          UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
          RETURN;
        END IF;

        SELECT id INTO colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';

        SELECT quantity INTO v_colony_ship_quantity
        FROM fleet_ships
        WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;

        has_colony_ship := COALESCE(v_colony_ship_quantity, 0) > 0;

        IF has_colony_ship THEN
          v_cargo_metal := COALESCE(fleet_record.cargo_metal, 0);
          v_cargo_crystal := COALESCE(fleet_record.cargo_crystal, 0);
          v_cargo_deuterium := COALESCE(fleet_record.cargo_deuterium, 0);

          INSERT INTO planets (user_id, name, galaxy, solar_system, position, planet_type, is_main_planet, diameter, fields_max, temp_min, temp_max, image_id)
          VALUES (fleet_record.user_id, 'Colonia', fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            'planet', false, 12800 + floor(random() * 5000)::integer, 163 + floor(random() * 50)::integer,
            -20 + floor(random() * 40)::integer, 20 + floor(random() * 60)::integer, floor(random() * 10 + 1)::integer)
          RETURNING id INTO new_planet_id;

          INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, metal_per_hour, crystal_per_hour, deuterium_per_hour)
          VALUES (new_planet_id, 500 + v_cargo_metal, 500 + v_cargo_crystal, v_cargo_deuterium, 30, 15, 0);

          IF v_colony_ship_quantity = 1 THEN
            DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
          ELSE
            UPDATE fleet_ships SET quantity = quantity - 1 WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
          END IF;

          UPDATE fleets SET cargo_metal = 0, cargo_crystal = 0, cargo_deuterium = 0 WHERE id = p_fleet_id;

          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
          VALUES (NULL, fleet_record.user_id, 'Colonia Establecida',
            format('Se ha establecido una nueva colonia en [%s:%s:%s]. Recursos depositados: %s Metal, %s Cristal, %s Deuterio',
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
              floor(500 + v_cargo_metal), floor(500 + v_cargo_crystal), floor(v_cargo_deuterium)),
            'system');

          v_colonization_success := true;

          SELECT COALESCE(SUM(quantity), 0) INTO v_remaining_ships
          FROM fleet_ships WHERE fleet_id = p_fleet_id;

          IF v_remaining_ships > 0 THEN
            UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
          ELSE
            DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
            UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
          END IF;
        END IF;
      END;
    END IF;

    IF NOT v_colonization_success THEN
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    END IF;

  WHEN 'expedition' THEN
    v_expedition_result := process_expedition(p_fleet_id);

  ELSE
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
END;
$fn$;
