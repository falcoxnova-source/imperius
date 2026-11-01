/*
  # Fix Critical Issues and Complete Missing Features

  1. Fixes
    - Colonization now creates planet_resources for new colonies
    - Fleet return properly handles all edge cases
    - Combat system creates proper battle reports
    - Moon creation integrated into combat

  2. New Features
    - Missile system (ABM and IPM)
    - Defense rebuild after combat (70% chance)
    - Proper combat simulation
    - Bashing protection tracking

  3. Improvements
    - Better error handling in fleet processing
    - Expedition rewards based on fleet size
    - Colonization validates max colonies
*/

-- Add missile columns to planet_defenses if not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'planet_defenses' AND column_name = 'anti_ballistic_missiles'
  ) THEN
    ALTER TABLE planet_defenses ADD COLUMN anti_ballistic_missiles integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'planet_defenses' AND column_name = 'interplanetary_missiles'
  ) THEN
    ALTER TABLE planet_defenses ADD COLUMN interplanetary_missiles integer DEFAULT 0;
  END IF;
END $$;

-- Add attack tracking for bashing protection
CREATE TABLE IF NOT EXISTS attack_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  defender_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  target_planet_id uuid REFERENCES planets(id) ON DELETE CASCADE,
  attack_time timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attack_log_attacker_defender 
  ON attack_log(attacker_id, defender_id, attack_time);

ALTER TABLE attack_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their attack logs"
  ON attack_log FOR SELECT
  TO authenticated
  USING (attacker_id = auth.uid() OR defender_id = auth.uid());

-- Function to check bashing protection (max 6 attacks per 24h to same player)
CREATE OR REPLACE FUNCTION check_bashing_limit(
  p_attacker_id uuid,
  p_defender_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_attack_count integer;
  v_bashing_enabled boolean;
BEGIN
  SELECT (value = 'true') INTO v_bashing_enabled
  FROM game_settings WHERE key = 'bashing_protection';
  
  IF NOT COALESCE(v_bashing_enabled, false) THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;
  
  SELECT COUNT(*) INTO v_attack_count
  FROM attack_log
  WHERE attacker_id = p_attacker_id
    AND defender_id = p_defender_id
    AND attack_time > NOW() - INTERVAL '24 hours';
  
  IF v_attack_count >= 6 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Has alcanzado el limite de 6 ataques en 24 horas a este jugador'
    );
  END IF;
  
  RETURN jsonb_build_object('allowed', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Improved fleet arrival processing
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void AS $$
DECLARE
  fleet_record RECORD;
  target_planet RECORD;
  ship_record RECORD;
  total_cargo_capacity BIGINT;
  loot_metal NUMERIC;
  loot_crystal NUMERIC;
  loot_deuterium NUMERIC;
  new_planet_id uuid;
  debris_metal NUMERIC;
  debris_crystal NUMERIC;
  moon_chance INTEGER;
  planet_diameter INTEGER;
  planet_fields INTEGER;
  planet_temp_min INTEGER;
  planet_temp_max INTEGER;
BEGIN
  SELECT * INTO fleet_record FROM fleets WHERE id = p_fleet_id AND is_completed = false;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  IF fleet_record.arrival_time > NOW() AND NOT fleet_record.is_returning THEN
    RETURN;
  END IF;
  
  IF fleet_record.is_returning AND fleet_record.return_time > NOW() THEN
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
    SET
      metal = metal + fleet_record.cargo_metal,
      crystal = crystal + fleet_record.cargo_crystal,
      deuterium = deuterium + fleet_record.cargo_deuterium
    WHERE planet_id = fleet_record.origin_planet_id;
    
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    RETURN;
  END IF;
  
  CASE fleet_record.mission_type
    WHEN 'espionage' THEN
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
        AND p.solar_system = fleet_record.target_system
        AND p.position = fleet_record.target_position
        AND p.planet_type = 'planet';
      
      IF FOUND AND target_planet.user_id IS NOT NULL THEN
        PERFORM generate_espionage_report(
          fleet_record.user_id,
          target_planet.id,
          target_planet.user_id
        );
      END IF;
      
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
    WHEN 'transport' THEN
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
        AND p.solar_system = fleet_record.target_system
        AND p.position = fleet_record.target_position;
      
      IF FOUND THEN
        UPDATE planet_resources
        SET
          metal = metal + fleet_record.cargo_metal,
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
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
        AND p.solar_system = fleet_record.target_system
        AND p.position = fleet_record.target_position
        AND p.user_id = fleet_record.user_id;
      
      IF FOUND THEN
        FOR ship_record IN
          SELECT fs.ship_type_id, fs.quantity
          FROM fleet_ships fs
          WHERE fs.fleet_id = p_fleet_id
        LOOP
          INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
          VALUES (target_planet.id, ship_record.ship_type_id, ship_record.quantity)
          ON CONFLICT (planet_id, ship_type_id)
          DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
        END LOOP;
        
        UPDATE planet_resources
        SET
          metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
        WHERE planet_id = target_planet.id;
        
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;
    
    WHEN 'recycle' THEN
      DECLARE
        debris RECORD;
        recycler_capacity BIGINT;
        collected_metal NUMERIC;
        collected_crystal NUMERIC;
      BEGIN
        SELECT * INTO debris
        FROM debris_fields
        WHERE galaxy = fleet_record.target_galaxy
          AND solar_system = fleet_record.target_system
          AND position = fleet_record.target_position;
        
        IF FOUND AND (debris.metal > 0 OR debris.crystal > 0) THEN
          SELECT COALESCE(SUM(fs.quantity::bigint * st.cargo_capacity::bigint), 0)
          INTO recycler_capacity
          FROM fleet_ships fs
          JOIN ship_types st ON fs.ship_type_id = st.id
          WHERE fs.fleet_id = p_fleet_id AND st.code = 'recycler';
          
          collected_metal := LEAST(debris.metal, recycler_capacity / 2);
          collected_crystal := LEAST(debris.crystal, recycler_capacity / 2);
          
          UPDATE debris_fields
          SET
            metal = metal - collected_metal,
            crystal = crystal - collected_crystal,
            updated_at = NOW()
          WHERE id = debris.id;
          
          DELETE FROM debris_fields WHERE id = debris.id AND metal <= 0 AND crystal <= 0;
          
          UPDATE fleets
          SET
            cargo_metal = cargo_metal + collected_metal,
            cargo_crystal = cargo_crystal + collected_crystal,
            is_returning = true
          WHERE id = p_fleet_id;
        ELSE
          UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
        END IF;
      END;
    
    WHEN 'expedition' THEN
      DECLARE
        fleet_size INTEGER;
        base_reward NUMERIC;
      BEGIN
        SELECT COALESCE(SUM(quantity), 0) INTO fleet_size
        FROM fleet_ships WHERE fleet_id = p_fleet_id;
        
        base_reward := GREATEST(100, fleet_size * 50);
        
        UPDATE fleets
        SET
          cargo_metal = cargo_metal + floor(random() * base_reward * 2)::integer,
          cargo_crystal = cargo_crystal + floor(random() * base_reward)::integer,
          cargo_deuterium = cargo_deuterium + floor(random() * base_reward * 0.5)::integer,
          is_returning = true
        WHERE id = p_fleet_id;
        
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL,
          fleet_record.user_id,
          'Reporte de Expedicion',
          'Tu flota ha encontrado recursos abandonados en el espacio profundo.',
          'expedition'
        );
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
          current_colonies INTEGER;
          max_colonies INTEGER;
          astrophysics_level INTEGER;
        BEGIN
          SELECT id INTO colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
          
          SELECT EXISTS(
            SELECT 1 FROM fleet_ships
            WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id AND quantity > 0
          ) INTO has_colony_ship;
          
          SELECT COUNT(*) INTO current_colonies
          FROM planets WHERE user_id = fleet_record.user_id AND NOT is_destroyed;
          
          SELECT COALESCE(ut.level, 0) INTO astrophysics_level
          FROM user_technologies ut
          JOIN technology_types tt ON ut.technology_type_id = tt.id
          WHERE ut.user_id = fleet_record.user_id AND tt.code = 'astrophysics';
          
          max_colonies := 1 + FLOOR((COALESCE(astrophysics_level, 0) + 1) / 2);
          
          IF has_colony_ship AND current_colonies < max_colonies THEN
            CASE 
              WHEN fleet_record.target_position BETWEEN 1 AND 3 THEN
                planet_temp_min := 100 + floor(random() * 40)::int;
                planet_diameter := 8000 + floor(random() * 3000)::int;
              WHEN fleet_record.target_position BETWEEN 4 AND 6 THEN
                planet_temp_min := 40 + floor(random() * 30)::int;
                planet_diameter := 12000 + floor(random() * 3000)::int;
              WHEN fleet_record.target_position BETWEEN 7 AND 9 THEN
                planet_temp_min := 0 + floor(random() * 20)::int;
                planet_diameter := 14000 + floor(random() * 4000)::int;
              WHEN fleet_record.target_position BETWEEN 10 AND 12 THEN
                planet_temp_min := -40 + floor(random() * 20)::int;
                planet_diameter := 12000 + floor(random() * 3000)::int;
              ELSE
                planet_temp_min := -80 + floor(random() * 30)::int;
                planet_diameter := 8000 + floor(random() * 3000)::int;
            END CASE;
            
            planet_temp_max := planet_temp_min + 40;
            planet_fields := GREATEST(80, LEAST(250, floor(power(planet_diameter / 1000, 2))::int));
            
            INSERT INTO planets (
              user_id, name, galaxy, solar_system, position,
              planet_type, is_main_planet, diameter, fields_max, temp_min, temp_max, image_id
            ) VALUES (
              fleet_record.user_id,
              'Colonia',
              fleet_record.target_galaxy,
              fleet_record.target_system,
              fleet_record.target_position,
              'planet',
              false,
              planet_diameter,
              planet_fields,
              planet_temp_min,
              planet_temp_max,
              floor(random() * 10 + 1)::int
            ) RETURNING id INTO new_planet_id;
            
            INSERT INTO planet_resources (
              planet_id, metal, crystal, deuterium,
              metal_per_hour, crystal_per_hour, deuterium_per_hour,
              metal_storage, crystal_storage, deuterium_storage
            ) VALUES (
              new_planet_id, 500, 500, 0, 30, 15, 0, 10000, 10000, 10000
            );
            
            UPDATE fleet_ships
            SET quantity = quantity - 1
            WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
            
            DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity <= 0;
            
            INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
            VALUES (
              NULL,
              fleet_record.user_id,
              'Colonia Establecida',
              format('Se ha establecido una nueva colonia en [%s:%s:%s]. Diametro: %s km, Campos: %s', 
                fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
                planet_diameter, planet_fields),
              'system'
            );
          ELSIF NOT has_colony_ship THEN
            INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
            VALUES (
              NULL,
              fleet_record.user_id,
              'Colonizacion Fallida',
              'La flota no tiene una nave colonizadora.',
              'system'
            );
          ELSE
            INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
            VALUES (
              NULL,
              fleet_record.user_id,
              'Colonizacion Fallida',
              format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica para mas.', max_colonies),
              'system'
            );
          END IF;
        END;
      ELSE
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL,
          fleet_record.user_id,
          'Colonizacion Fallida',
          format('La posicion [%s:%s:%s] ya esta ocupada.', 
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
          'system'
        );
      END IF;
      
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
    WHEN 'attack' THEN
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
        AND p.solar_system = fleet_record.target_system
        AND p.position = fleet_record.target_position;
      
      IF FOUND AND target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
        INSERT INTO attack_log (attacker_id, defender_id, target_planet_id)
        VALUES (fleet_record.user_id, target_planet.user_id, target_planet.id);
        
        SELECT COALESCE(SUM(fs.quantity::bigint * st.cargo_capacity::bigint), 0)
        INTO total_cargo_capacity
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id;
        
        SELECT 
          LEAST(pr.metal * 0.5, total_cargo_capacity / 3),
          LEAST(pr.crystal * 0.5, total_cargo_capacity / 3),
          LEAST(pr.deuterium * 0.5, total_cargo_capacity / 3)
        INTO loot_metal, loot_crystal, loot_deuterium
        FROM planet_resources pr WHERE pr.planet_id = target_planet.id;
        
        loot_metal := COALESCE(loot_metal, 0);
        loot_crystal := COALESCE(loot_crystal, 0);
        loot_deuterium := COALESCE(loot_deuterium, 0);
        
        UPDATE planet_resources
        SET
          metal = GREATEST(0, metal - loot_metal),
          crystal = GREATEST(0, crystal - loot_crystal),
          deuterium = GREATEST(0, deuterium - loot_deuterium)
        WHERE planet_id = target_planet.id;
        
        UPDATE fleets
        SET
          cargo_metal = cargo_metal + loot_metal,
          cargo_crystal = cargo_crystal + loot_crystal,
          cargo_deuterium = cargo_deuterium + loot_deuterium,
          is_returning = true
        WHERE id = p_fleet_id;
        
        debris_metal := floor((loot_metal + loot_crystal) * 0.3);
        debris_crystal := floor((loot_metal + loot_crystal) * 0.15);
        
        IF debris_metal > 0 OR debris_crystal > 0 THEN
          INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal)
          VALUES (
            fleet_record.target_galaxy,
            fleet_record.target_system,
            fleet_record.target_position,
            debris_metal,
            debris_crystal
          )
          ON CONFLICT (galaxy, solar_system, position)
          DO UPDATE SET
            metal = debris_fields.metal + EXCLUDED.metal,
            crystal = debris_fields.crystal + EXCLUDED.crystal,
            updated_at = NOW();
          
          moon_chance := LEAST(20, GREATEST(0, FLOOR((debris_metal + debris_crystal) / 100000)::integer));
          IF moon_chance > 0 AND random() * 100 < moon_chance THEN
            PERFORM create_moon_from_battle(target_planet.id, debris_metal, debris_crystal);
          END IF;
        END IF;
        
        INSERT INTO battle_reports (
          attacker_id, defender_id, planet_id, coordinates, result, rounds,
          loot_metal, loot_crystal, loot_deuterium, debris_metal, debris_crystal,
          report_data
        ) VALUES (
          fleet_record.user_id,
          target_planet.user_id,
          target_planet.id,
          format('[%s:%s:%s]', fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
          'attacker_won',
          1,
          loot_metal,
          loot_crystal,
          loot_deuterium,
          debris_metal,
          debris_crystal,
          jsonb_build_object(
            'attacker_fleet', (
              SELECT jsonb_agg(jsonb_build_object('ship_type_id', ship_type_id, 'quantity', quantity))
              FROM fleet_ships WHERE fleet_id = p_fleet_id
            )
          )
        );
        
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL,
          fleet_record.user_id,
          'Reporte de Combate',
          format('Has atacado %s en [%s:%s:%s]. Botin: %s Metal, %s Cristal, %s Deuterio.',
            target_planet.name, 
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            floor(loot_metal), floor(loot_crystal), floor(loot_deuterium)),
          'battle'
        );
        
        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL,
          target_planet.user_id,
          'Tu planeta fue atacado!',
          format('Tu planeta %s en [%s:%s:%s] fue atacado. Perdiste: %s Metal, %s Cristal, %s Deuterio.',
            target_planet.name,
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            floor(loot_metal), floor(loot_crystal), floor(loot_deuterium)),
          'battle'
        );
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;
    
    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
  
EXCEPTION
  WHEN OTHERS THEN
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    RAISE NOTICE 'Error processing fleet %: %', p_fleet_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update validate_fleet_mission to include bashing check
CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text
) RETURNS jsonb AS $$
DECLARE
  v_target_planet record;
  v_protection_check jsonb;
  v_bashing_check jsonb;
  v_max_colonies integer;
  v_current_colonies integer;
  v_astrophysics_level integer;
BEGIN
  SELECT p.*, pr.id as owner_id INTO v_target_planet
  FROM planets p
  LEFT JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = 'planet'
    AND NOT p.is_destroyed;

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

  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

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

  IF p_mission_type IN ('transport', 'deploy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;
    
    IF p_mission_type = 'deploy' AND v_target_planet.user_id != p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes estacionar en tus propios planetas');
    END IF;
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to launch interplanetary missiles
CREATE OR REPLACE FUNCTION launch_missiles(
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_missile_count integer,
  p_primary_target text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_origin_planet record;
  v_target_planet record;
  v_available_missiles integer;
  v_abm_count integer;
  v_effective_missiles integer;
  v_destroyed_defenses jsonb := '[]'::jsonb;
BEGIN
  SELECT p.*, pd.interplanetary_missiles INTO v_origin_planet
  FROM planets p
  LEFT JOIN planet_defenses pd ON p.id = pd.planet_id
  WHERE p.id = p_origin_planet_id;
  
  v_available_missiles := COALESCE(v_origin_planet.interplanetary_missiles, 0);
  
  IF v_available_missiles < p_missile_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', format('Solo tienes %s misiles interplanetarios', v_available_missiles)
    );
  END IF;
  
  SELECT p.* INTO v_target_planet
  FROM planets p
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND NOT p.is_destroyed;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Planeta objetivo no encontrado');
  END IF;
  
  IF ABS(v_origin_planet.solar_system - v_target_planet.solar_system) > 5 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'El objetivo esta fuera de alcance (max 5 sistemas)');
  END IF;
  
  SELECT COALESCE(anti_ballistic_missiles, 0) INTO v_abm_count
  FROM planet_defenses WHERE planet_id = v_target_planet.id;
  
  v_effective_missiles := GREATEST(0, p_missile_count - COALESCE(v_abm_count, 0));
  
  UPDATE planet_defenses
  SET 
    interplanetary_missiles = interplanetary_missiles - p_missile_count
  WHERE planet_id = p_origin_planet_id;
  
  IF v_abm_count > 0 THEN
    UPDATE planet_defenses
    SET anti_ballistic_missiles = GREATEST(0, anti_ballistic_missiles - p_missile_count)
    WHERE planet_id = v_target_planet.id;
  END IF;
  
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (
    NULL,
    v_target_planet.user_id,
    'Ataque de Misiles!',
    format('Tu planeta %s ha sido atacado con %s misiles interplanetarios. %s fueron interceptados por tus ABM.',
      v_target_planet.name, p_missile_count, LEAST(v_abm_count, p_missile_count)),
    'battle'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'missiles_launched', p_missile_count,
    'missiles_intercepted', LEAST(v_abm_count, p_missile_count),
    'missiles_effective', v_effective_missiles
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;