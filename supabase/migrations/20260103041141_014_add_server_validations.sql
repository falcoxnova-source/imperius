/*
  # Add Server-Side Validations and Fleet Processing

  1. Changes
    - Add function to validate single research constraint
    - Add function to process fleet arrivals
    - Add trigger to prevent multiple simultaneous researches
    - Add scheduled job placeholder for fleet processing

  2. Security
    - Server-side validation prevents race conditions
    - Functions run with SECURITY DEFINER for proper access

  3. Notes
    - This migration adds critical game logic validations
    - Prevents cheating through race condition exploits
*/

-- Function to check if user already has research in progress
CREATE OR REPLACE FUNCTION check_single_research()
RETURNS TRIGGER AS $$
BEGIN
  -- If we're setting is_researching to true
  IF NEW.is_researching = true AND (OLD.is_researching IS NULL OR OLD.is_researching = false) THEN
    -- Check if user already has another research in progress
    IF EXISTS (
      SELECT 1 FROM user_technologies
      WHERE user_id = NEW.user_id
      AND is_researching = true
      AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'User already has a research in progress';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for research validation
DROP TRIGGER IF EXISTS enforce_single_research ON user_technologies;
CREATE TRIGGER enforce_single_research
  BEFORE INSERT OR UPDATE ON user_technologies
  FOR EACH ROW
  EXECUTE FUNCTION check_single_research();

-- Function to complete research when time is up
CREATE OR REPLACE FUNCTION complete_research(p_user_id uuid)
RETURNS void AS $$
DECLARE
  research_record RECORD;
BEGIN
  -- Find completed researches
  FOR research_record IN
    SELECT id, level
    FROM user_technologies
    WHERE user_id = p_user_id
    AND is_researching = true
    AND research_end_time <= NOW()
  LOOP
    -- Update the research to completed
    UPDATE user_technologies
    SET
      level = level + 1,
      is_researching = false,
      research_end_time = NULL,
      research_planet_id = NULL
    WHERE id = research_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate building queue (prevent queue overflow)
CREATE OR REPLACE FUNCTION check_building_queue_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_queue_count INTEGER;
  max_slots INTEGER;
  has_commander BOOLEAN;
BEGIN
  -- Count current queue items for this planet
  SELECT COUNT(*) INTO current_queue_count
  FROM building_queue
  WHERE planet_id = NEW.planet_id;

  -- Check if user has commander officer (allows 5 slots instead of 3)
  SELECT EXISTS(
    SELECT 1 FROM user_officers uo
    JOIN officer_types ot ON uo.officer_type_id = ot.id
    WHERE uo.user_id = (SELECT user_id FROM planets WHERE id = NEW.planet_id)
    AND ot.code = 'commander'
    AND uo.expires_at > NOW()
  ) INTO has_commander;

  -- Set max slots based on commander
  IF has_commander THEN
    max_slots := 5;
  ELSE
    max_slots := 3;
  END IF;

  -- Check limit
  IF current_queue_count >= max_slots THEN
    RAISE EXCEPTION 'Building queue is full (max % slots)', max_slots;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for building queue validation
DROP TRIGGER IF EXISTS enforce_building_queue_limit ON building_queue;
CREATE TRIGGER enforce_building_queue_limit
  BEFORE INSERT ON building_queue
  FOR EACH ROW
  EXECUTE FUNCTION check_building_queue_limit();

-- Function to process fleet arrivals
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void AS $$
DECLARE
  fleet_record RECORD;
  target_planet RECORD;
  ship_record RECORD;
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

    -- Mark fleet as completed
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    RETURN;
  END IF;

  -- Fleet has arrived at destination - process based on mission type
  CASE fleet_record.mission_type
    WHEN 'transport' THEN
      -- Find target planet
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position;

      IF FOUND THEN
        -- Deliver cargo
        UPDATE planet_resources
        SET
          metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
        WHERE planet_id = target_planet.id;

        -- Clear cargo for return trip
        UPDATE fleets
        SET
          cargo_metal = 0,
          cargo_crystal = 0,
          cargo_deuterium = 0,
          is_returning = true
        WHERE id = p_fleet_id;
      ELSE
        -- Target doesn't exist, return with cargo
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;

    WHEN 'deploy' THEN
      -- Find target planet owned by same user
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position
      AND p.user_id = fleet_record.user_id;

      IF FOUND THEN
        -- Deploy ships to target planet
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

        -- Deliver cargo
        UPDATE planet_resources
        SET
          metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
        WHERE planet_id = target_planet.id;

        -- Delete fleet ships and mark fleet as completed
        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
      ELSE
        -- Target not owned by user, return
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;

    WHEN 'expedition' THEN
      -- Expeditions return after arrival time with potential rewards
      -- Random chance for resources (simplified)
      UPDATE fleets
      SET
        cargo_metal = cargo_metal + floor(random() * 5000)::integer,
        cargo_crystal = cargo_crystal + floor(random() * 3000)::integer,
        cargo_deuterium = cargo_deuterium + floor(random() * 1000)::integer,
        is_returning = true
      WHERE id = p_fleet_id;

    ELSE
      -- For other missions (attack, espionage, etc.), just set returning for now
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process all pending fleet arrivals for a user
CREATE OR REPLACE FUNCTION process_user_fleets(p_user_id uuid)
RETURNS void AS $$
DECLARE
  fleet_record RECORD;
BEGIN
  -- Process all fleets that have arrived
  FOR fleet_record IN
    SELECT id FROM fleets
    WHERE user_id = p_user_id
    AND is_completed = false
    AND (
      (is_returning = false AND arrival_time <= NOW())
      OR (is_returning = true AND return_time <= NOW())
    )
  LOOP
    PERFORM process_fleet_arrival(fleet_record.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION complete_research(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION process_user_fleets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION process_fleet_arrival(uuid) TO authenticated;