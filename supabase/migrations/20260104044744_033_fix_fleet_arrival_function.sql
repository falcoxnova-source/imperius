/*
  # Fix Fleet Arrival Function
  
  1. Changes
    - Fix column name: hull_points -> structural_integrity
    - Fix column reference in defense_types as well
*/

CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fleet_record RECORD;
  target_planet RECORD;
  ship_record RECORD;
  total_cargo_capacity INTEGER;
  loot_metal NUMERIC;
  loot_crystal NUMERIC;
  loot_deuterium NUMERIC;
  v_debris_metal NUMERIC;
  v_debris_crystal NUMERIC;
  v_attacker_ships jsonb;
  v_defender_ships jsonb;
  v_defender_defenses jsonb;
  v_total_attacker_struct NUMERIC;
  v_total_defender_struct NUMERIC;
  v_moon_result jsonb;
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
    WHEN 'expedition' THEN
      PERFORM process_expedition(p_fleet_id);

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
          SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
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
        BEGIN
          SELECT id INTO colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
          
          SELECT EXISTS(
            SELECT 1 FROM fleet_ships
            WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id AND quantity > 0
          ) INTO has_colony_ship;

          IF has_colony_ship THEN
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

            UPDATE fleet_ships
            SET quantity = quantity - 1
            WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
            
            DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity <= 0;

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
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position;

      IF FOUND AND target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
        SELECT COALESCE(SUM(fs.quantity * (st.structural_integrity + st.shield_power)), 0)
        INTO v_total_attacker_struct
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id;
        
        SELECT COALESCE(SUM(ps.quantity * (st.structural_integrity + st.shield_power)), 0)
        INTO v_total_defender_struct
        FROM planet_ships ps
        JOIN ship_types st ON ps.ship_type_id = st.id
        WHERE ps.planet_id = target_planet.id;
        
        v_total_defender_struct := v_total_defender_struct + COALESCE((
          SELECT SUM(pd.quantity * (dt.structural_integrity + dt.shield_power))
          FROM planet_defenses pd
          JOIN defense_types dt ON pd.defense_type_id = dt.id
          WHERE pd.planet_id = target_planet.id
        ), 0);
        
        SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
        INTO total_cargo_capacity
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id;

        SELECT 
          LEAST(metal * 0.5, total_cargo_capacity / 3),
          LEAST(crystal * 0.5, total_cargo_capacity / 3),
          LEAST(deuterium * 0.5, total_cargo_capacity / 3)
        INTO loot_metal, loot_crystal, loot_deuterium
        FROM planet_resources WHERE planet_id = target_planet.id;

        UPDATE planet_resources
        SET
          metal = metal - loot_metal,
          crystal = crystal - loot_crystal,
          deuterium = deuterium - loot_deuterium
        WHERE planet_id = target_planet.id;

        UPDATE fleets
        SET
          cargo_metal = cargo_metal + loot_metal,
          cargo_crystal = cargo_crystal + loot_crystal,
          cargo_deuterium = cargo_deuterium + loot_deuterium,
          is_returning = true
        WHERE id = p_fleet_id;

        v_debris_metal := (v_total_attacker_struct + v_total_defender_struct) * 0.3 * 0.5;
        v_debris_crystal := (v_total_attacker_struct + v_total_defender_struct) * 0.3 * 0.3;
        
        INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal)
        VALUES (
          fleet_record.target_galaxy,
          fleet_record.target_system,
          fleet_record.target_position,
          v_debris_metal,
          v_debris_crystal
        )
        ON CONFLICT (galaxy, solar_system, position)
        DO UPDATE SET
          metal = debris_fields.metal + v_debris_metal,
          crystal = debris_fields.crystal + v_debris_crystal,
          updated_at = NOW();

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
$$ LANGUAGE plpgsql;
