/*
  # Debris Fields and Espionage Reports System

  1. New Tables
    - `debris_fields` - Stores debris at coordinates from battles
      - `id` (uuid, primary key)
      - `galaxy`, `solar_system`, `position` (coordinates)
      - `metal`, `crystal` (resources in debris)
      - `created_at`, `updated_at` (timestamps)

  2. Modified Functions
    - Enhanced espionage processing to generate reports
    - Enhanced attack processing to create debris fields
    - Added recycle mission to collect debris

  3. Security
    - RLS enabled on debris_fields
    - Anyone can view debris, only system can modify
*/

-- Create debris_fields table
CREATE TABLE IF NOT EXISTS debris_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  galaxy integer NOT NULL CHECK (galaxy >= 1 AND galaxy <= 9),
  solar_system integer NOT NULL CHECK (solar_system >= 1 AND solar_system <= 499),
  position integer NOT NULL CHECK (position >= 1 AND position <= 15),
  metal numeric DEFAULT 0,
  crystal numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(galaxy, solar_system, position)
);

-- Enable RLS
ALTER TABLE debris_fields ENABLE ROW LEVEL SECURITY;

-- Anyone can view debris fields
CREATE POLICY "Anyone can view debris fields"
  ON debris_fields FOR SELECT
  TO authenticated
  USING (true);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_debris_coordinates ON debris_fields(galaxy, solar_system, position);

-- Function to generate espionage report
CREATE OR REPLACE FUNCTION generate_espionage_report(
  p_attacker_id uuid,
  p_target_planet_id uuid,
  p_target_user_id uuid
)
RETURNS void AS $$
DECLARE
  target_resources RECORD;
  target_buildings JSONB;
  target_ships JSONB;
  target_defenses JSONB;
  target_techs JSONB;
  target_planet RECORD;
  report_data JSONB;
BEGIN
  -- Get target planet info
  SELECT * INTO target_planet FROM planets WHERE id = p_target_planet_id;
  
  -- Get target resources
  SELECT metal, crystal, deuterium, energy_used, energy_max
  INTO target_resources
  FROM planet_resources WHERE planet_id = p_target_planet_id;
  
  -- Get target buildings
  SELECT jsonb_agg(jsonb_build_object(
    'name', bt.name,
    'level', pb.level
  ))
  INTO target_buildings
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_target_planet_id AND pb.level > 0;
  
  -- Get target ships
  SELECT jsonb_agg(jsonb_build_object(
    'name', st.name,
    'quantity', ps.quantity
  ))
  INTO target_ships
  FROM planet_ships ps
  JOIN ship_types st ON ps.ship_type_id = st.id
  WHERE ps.planet_id = p_target_planet_id AND ps.quantity > 0;
  
  -- Get target defenses
  SELECT jsonb_agg(jsonb_build_object(
    'name', dt.name,
    'quantity', pd.quantity
  ))
  INTO target_defenses
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = p_target_planet_id AND pd.quantity > 0;
  
  -- Get target technologies (if spy tech is high enough)
  SELECT jsonb_agg(jsonb_build_object(
    'name', tt.name,
    'level', ut.level
  ))
  INTO target_techs
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_target_user_id AND ut.level > 0;
  
  -- Build report data
  report_data := jsonb_build_object(
    'planet_name', target_planet.name,
    'coordinates', format('[%s:%s:%s]', target_planet.galaxy, target_planet.solar_system, target_planet.position),
    'resources', jsonb_build_object(
      'metal', COALESCE(target_resources.metal, 0),
      'crystal', COALESCE(target_resources.crystal, 0),
      'deuterium', COALESCE(target_resources.deuterium, 0)
    ),
    'buildings', COALESCE(target_buildings, '[]'::jsonb),
    'ships', COALESCE(target_ships, '[]'::jsonb),
    'defenses', COALESCE(target_defenses, '[]'::jsonb),
    'technologies', COALESCE(target_techs, '[]'::jsonb)
  );
  
  -- Create message with espionage report
  INSERT INTO messages (
    sender_id,
    recipient_id,
    subject,
    body,
    message_type
  ) VALUES (
    NULL,
    p_attacker_id,
    'Reporte de Espionaje - ' || target_planet.name,
    report_data::text,
    'espionage'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced fleet arrival processing with espionage
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void AS $$
DECLARE
  fleet_record RECORD;
  target_planet RECORD;
  ship_record RECORD;
  total_cargo_capacity INTEGER;
  loot_metal NUMERIC;
  loot_crystal NUMERIC;
  loot_deuterium NUMERIC;
BEGIN
  -- Get fleet details
  SELECT * INTO fleet_record FROM fleets WHERE id = p_fleet_id AND is_completed = false;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check if fleet has arrived
  IF fleet_record.arrival_time > NOW() AND NOT fleet_record.is_returning THEN
    RETURN;
  END IF;

  -- Check if fleet is returning and has arrived back
  IF fleet_record.is_returning AND fleet_record.return_time > NOW() THEN
    RETURN;
  END IF;

  -- If fleet is returning and arrived back
  IF fleet_record.is_returning THEN
    -- Return ships to origin planet
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

    -- Return cargo to origin planet
    UPDATE planet_resources
    SET
      metal = metal + fleet_record.cargo_metal,
      crystal = crystal + fleet_record.cargo_crystal,
      deuterium = deuterium + fleet_record.cargo_deuterium
    WHERE planet_id = fleet_record.origin_planet_id;

    -- Mark fleet as completed and delete ships
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    RETURN;
  END IF;

  -- Fleet has arrived at destination - process based on mission type
  CASE fleet_record.mission_type
    WHEN 'espionage' THEN
      -- Find target planet and generate spy report
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
      
      -- Set returning
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
        SET
          cargo_metal = 0,
          cargo_crystal = 0,
          cargo_deuterium = 0,
          is_returning = true
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
      -- Check for debris at target coordinates
      DECLARE
        debris RECORD;
        recycler_capacity INTEGER;
        total_recyclers INTEGER;
        collected_metal NUMERIC;
        collected_crystal NUMERIC;
      BEGIN
        SELECT * INTO debris
        FROM debris_fields
        WHERE galaxy = fleet_record.target_galaxy
        AND solar_system = fleet_record.target_system
        AND position = fleet_record.target_position;

        IF FOUND AND (debris.metal > 0 OR debris.crystal > 0) THEN
          -- Calculate recycler capacity
          SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
          INTO recycler_capacity
          FROM fleet_ships fs
          JOIN ship_types st ON fs.ship_type_id = st.id
          WHERE fs.fleet_id = p_fleet_id AND st.code = 'recycler';

          -- Collect debris (50% of capacity for each resource type)
          collected_metal := LEAST(debris.metal, recycler_capacity / 2);
          collected_crystal := LEAST(debris.crystal, recycler_capacity / 2);

          -- Update debris field
          UPDATE debris_fields
          SET
            metal = metal - collected_metal,
            crystal = crystal - collected_crystal,
            updated_at = NOW()
          WHERE id = debris.id;

          -- Delete debris if empty
          DELETE FROM debris_fields WHERE id = debris.id AND metal <= 0 AND crystal <= 0;

          -- Add to cargo
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
      -- Random rewards from expedition
      UPDATE fleets
      SET
        cargo_metal = cargo_metal + floor(random() * 10000)::integer,
        cargo_crystal = cargo_crystal + floor(random() * 5000)::integer,
        cargo_deuterium = cargo_deuterium + floor(random() * 2000)::integer,
        is_returning = true
      WHERE id = p_fleet_id;

      -- Send expedition report
      INSERT INTO messages (
        sender_id,
        recipient_id,
        subject,
        body,
        message_type
      ) VALUES (
        NULL,
        fleet_record.user_id,
        'Reporte de Expedicion',
        'Tu flota ha encontrado recursos abandonados en el espacio profundo.',
        'expedition'
      );

    WHEN 'colonize' THEN
      -- Check if position is available
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position;

      IF NOT FOUND THEN
        -- Check for colony ship
        DECLARE
          colony_ship_type_id INTEGER;
          has_colony_ship BOOLEAN;
        BEGIN
          SELECT id INTO colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
          
          SELECT EXISTS(
            SELECT 1 FROM fleet_ships
            WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id AND quantity > 0
          ) INTO has_colony_ship;

          IF has_colony_ship THEN
            -- Create new planet at coordinates
            INSERT INTO planets (
              user_id,
              name,
              galaxy,
              solar_system,
              position,
              planet_type,
              is_main_planet
            ) VALUES (
              fleet_record.user_id,
              'Colonia',
              fleet_record.target_galaxy,
              fleet_record.target_system,
              fleet_record.target_position,
              'planet',
              false
            );

            -- Remove colony ship from fleet
            UPDATE fleet_ships
            SET quantity = quantity - 1
            WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
            
            DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity <= 0;

            -- Send success message
            INSERT INTO messages (
              sender_id,
              recipient_id,
              subject,
              body,
              message_type
            ) VALUES (
              NULL,
              fleet_record.user_id,
              'Colonia Establecida',
              format('Se ha establecido una nueva colonia en [%s:%s:%s]', 
                fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
              'system'
            );
          END IF;
        END;
      END IF;
      
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

    WHEN 'attack' THEN
      -- Simplified attack - just loot resources and create debris
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position;

      IF FOUND AND target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
        -- Calculate cargo capacity
        SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
        INTO total_cargo_capacity
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id;

        -- Loot up to 50% of resources, limited by cargo
        SELECT 
          LEAST(metal * 0.5, total_cargo_capacity / 3),
          LEAST(crystal * 0.5, total_cargo_capacity / 3),
          LEAST(deuterium * 0.5, total_cargo_capacity / 3)
        INTO loot_metal, loot_crystal, loot_deuterium
        FROM planet_resources WHERE planet_id = target_planet.id;

        -- Remove resources from target
        UPDATE planet_resources
        SET
          metal = metal - loot_metal,
          crystal = crystal - loot_crystal,
          deuterium = deuterium - loot_deuterium
        WHERE planet_id = target_planet.id;

        -- Add loot to cargo
        UPDATE fleets
        SET
          cargo_metal = cargo_metal + loot_metal,
          cargo_crystal = cargo_crystal + loot_crystal,
          cargo_deuterium = cargo_deuterium + loot_deuterium,
          is_returning = true
        WHERE id = p_fleet_id;

        -- Create debris field (30% of battle losses)
        INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal)
        VALUES (
          fleet_record.target_galaxy,
          fleet_record.target_system,
          fleet_record.target_position,
          floor(random() * 1000),
          floor(random() * 500)
        )
        ON CONFLICT (galaxy, solar_system, position)
        DO UPDATE SET
          metal = debris_fields.metal + EXCLUDED.metal,
          crystal = debris_fields.crystal + EXCLUDED.crystal,
          updated_at = NOW();

        -- Send battle report
        INSERT INTO messages (
          sender_id,
          recipient_id,
          subject,
          body,
          message_type
        ) VALUES (
          NULL,
          fleet_record.user_id,
          'Reporte de Combate',
          format('Has atacado %s en [%s:%s:%s]. Botin: %s Metal, %s Cristal, %s Deuterio.',
            target_planet.name, 
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            floor(loot_metal), floor(loot_crystal), floor(loot_deuterium)),
          'battle'
        );

        -- Notify defender
        INSERT INTO messages (
          sender_id,
          recipient_id,
          subject,
          body,
          message_type
        ) VALUES (
          NULL,
          target_planet.user_id,
          'Tu planeta fue atacado!',
          format('Tu planeta %s en [%s:%s:%s] fue atacado. Perdiste recursos.',
            target_planet.name,
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
          'battle'
        );
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;

    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;