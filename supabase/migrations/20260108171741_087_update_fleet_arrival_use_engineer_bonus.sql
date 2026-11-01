/*
  # Update process_fleet_arrival to use Engineer bonus
  
  Updates the attack combat results section to use the rebuild_destroyed_defenses
  function which applies Engineer officer bonus (85% rebuild vs 70%)
*/

-- Update process_fleet_arrival attack section to use new rebuild function
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
LANGUAGE plpgsql
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
  combat_result jsonb;
  v_unit jsonb;
  v_debris_metal NUMERIC := 0;
  v_debris_crystal NUMERIC := 0;
  v_dark_matter_found INTEGER := 0;
  v_expedition_message TEXT;
  v_colony_stats RECORD;
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

          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
          VALUES (
            NULL,
            fleet_record.user_id,
            'Reporte de Reciclaje',
            format('Tus recicladores han recogido %s Metal y %s Cristal de los escombros en [%s:%s:%s].',
              floor(collected_metal), floor(collected_crystal),
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
            'system'
          );
        ELSE
          UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

          INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
          VALUES (
            NULL,
            fleet_record.user_id,
            'Reciclaje Fallido',
            format('No se encontraron escombros en [%s:%s:%s].',
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
            'system'
          );
        END IF;
      END;

    WHEN 'expedition' THEN
      DECLARE
        v_metal_found NUMERIC;
        v_crystal_found NUMERIC;
        v_deuterium_found NUMERIC;
        v_event_roll NUMERIC;
        v_ship_find_type_id INTEGER;
        v_ship_find_quantity INTEGER;
      BEGIN
        v_event_roll := random();

        v_metal_found := floor(random() * 15000 + 5000)::integer;
        v_crystal_found := floor(random() * 8000 + 2000)::integer;
        v_deuterium_found := floor(random() * 4000 + 1000)::integer;

        v_expedition_message := format('Tu flota ha regresado de la expedicion con %s Metal, %s Cristal y %s Deuterio.',
          v_metal_found, v_crystal_found, v_deuterium_found);

        IF v_event_roll < 0.25 THEN
          v_dark_matter_found := floor(random() * 500 + 100)::integer;
          v_expedition_message := v_expedition_message || format(' Ademas, encontraron %s Materia Oscura!', v_dark_matter_found);

          UPDATE profiles
          SET dark_matter = dark_matter + v_dark_matter_found
          WHERE id = fleet_record.user_id;
        ELSIF v_event_roll < 0.35 THEN
          SELECT id INTO v_ship_find_type_id FROM ship_types 
          WHERE code IN ('light_fighter', 'heavy_fighter', 'cruiser')
          ORDER BY random() LIMIT 1;

          IF v_ship_find_type_id IS NOT NULL THEN
            v_ship_find_quantity := floor(random() * 10 + 1)::integer;

            INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
            VALUES (p_fleet_id, v_ship_find_type_id, v_ship_find_quantity)
            ON CONFLICT (fleet_id, ship_type_id)
            DO UPDATE SET quantity = fleet_ships.quantity + EXCLUDED.quantity;

            v_expedition_message := v_expedition_message || format(' Encontraron %s naves abandonadas y las incorporaron a la flota!', v_ship_find_quantity);
          END IF;
        ELSIF v_event_roll < 0.40 THEN
          v_metal_found := v_metal_found * 3;
          v_crystal_found := v_crystal_found * 3;
          v_deuterium_found := v_deuterium_found * 2;
          v_expedition_message := format('Gran descubrimiento! Tu flota encontro un deposito rico en recursos: %s Metal, %s Cristal y %s Deuterio!',
            v_metal_found, v_crystal_found, v_deuterium_found);
        END IF;

        UPDATE fleets
        SET
          cargo_metal = cargo_metal + v_metal_found,
          cargo_crystal = cargo_crystal + v_crystal_found,
          cargo_deuterium = cargo_deuterium + v_deuterium_found,
          is_returning = true
        WHERE id = p_fleet_id;

        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL,
          fleet_record.user_id,
          'Reporte de Expedicion',
          v_expedition_message,
          'expedition'
        );
      END;

    WHEN 'colonize' THEN
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position
      AND p.user_id IS NOT NULL;

      IF NOT FOUND THEN
        DECLARE
          colony_ship_type_id INTEGER;
          colony_ship_quantity INTEGER;
          new_planet_id uuid;
          v_fields_max INTEGER;
          v_temp_min INTEGER;
          v_temp_max INTEGER;
          v_diameter INTEGER;
        BEGIN
          SELECT id INTO colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';

          SELECT quantity INTO colony_ship_quantity 
          FROM fleet_ships
          WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;

          IF colony_ship_quantity IS NOT NULL AND colony_ship_quantity > 0 THEN
            SELECT * INTO v_colony_stats FROM calculate_colony_stats(fleet_record.target_position);

            v_temp_min := v_colony_stats.temp_min;
            v_temp_max := v_colony_stats.temp_max;
            v_fields_max := v_colony_stats.fields_min + floor(random() * (v_colony_stats.fields_max - v_colony_stats.fields_min))::integer;
            v_diameter := 10000 + floor(random() * 8000)::integer;

            INSERT INTO planets (
              user_id, name, galaxy, solar_system, position,
              planet_type, is_main_planet, diameter, fields_max, temp_min, temp_max, image_id
            ) VALUES (
              fleet_record.user_id, 'Colonia',
              fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
              'planet', false,
              v_diameter,
              v_fields_max,
              v_temp_min,
              v_temp_max,
              floor(random() * 10 + 1)::integer
            )
            RETURNING id INTO new_planet_id;

            INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, metal_per_hour, crystal_per_hour, deuterium_per_hour)
            VALUES (
              new_planet_id, 
              500 + fleet_record.cargo_metal,
              500 + fleet_record.cargo_crystal,
              fleet_record.cargo_deuterium,
              30, 15, 0
            );

            IF colony_ship_quantity = 1 THEN
              DELETE FROM fleet_ships 
              WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
            ELSE
              UPDATE fleet_ships
              SET quantity = quantity - 1
              WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
            END IF;

            UPDATE fleets
            SET
              cargo_metal = 0,
              cargo_crystal = 0,
              cargo_deuterium = 0
            WHERE id = p_fleet_id;

            INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
            VALUES (
              NULL,
              fleet_record.user_id,
              'Colonia Establecida',
              format('Se ha establecido una nueva colonia en [%s:%s:%s].

Estadisticas del planeta:
- Temperatura: %s C a %s C
- Campos: %s
- Diametro: %s km

Los recursos transportados (%s Metal, %s Cristal, %s Deuterio) han sido depositados junto con los recursos iniciales (500 Metal, 500 Cristal).', 
                fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
                v_temp_min, v_temp_max, v_fields_max, v_diameter,
                floor(fleet_record.cargo_metal), floor(fleet_record.cargo_crystal), floor(fleet_record.cargo_deuterium)),
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
          format('No se pudo establecer una colonia en [%s:%s:%s]. La posicion ya esta ocupada.', 
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
        combat_result := perform_combat(p_fleet_id, target_planet.id);

        IF (combat_result->>'result') = 'attacker_won' THEN
          SELECT COALESCE(SUM(
            (unit->>'quantity')::integer * (
              SELECT cargo_capacity FROM ship_types WHERE id = (unit->>'type_id')::integer
            )
          ), 0)
          INTO total_cargo_capacity
          FROM jsonb_array_elements(combat_result->'attacker_remaining') AS unit
          WHERE (unit->>'quantity')::integer > 0;

          SELECT 
            LEAST(metal * 0.5, total_cargo_capacity / 3),
            LEAST(crystal * 0.5, total_cargo_capacity / 3),
            LEAST(deuterium * 0.5, total_cargo_capacity / 3)
          INTO loot_metal, loot_crystal, loot_deuterium
          FROM planet_resources WHERE planet_id = target_planet.id;

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
            cargo_deuterium = cargo_deuterium + loot_deuterium
          WHERE id = p_fleet_id;

          DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining')
          LOOP
            IF (v_unit->>'quantity')::integer > 0 THEN
              INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
              VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer);
            END IF;
          END LOOP;

          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining')
          LOOP
            IF NOT (v_unit->>'is_defense')::boolean THEN
              UPDATE planet_ships
              SET quantity = (v_unit->>'quantity')::integer
              WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
            END IF;
          END LOOP;

          -- Use new function with Engineer bonus for defense rebuild
          PERFORM rebuild_destroyed_defenses(
            target_planet.id, 
            combat_result->'destroyed_defenses',
            target_planet.user_id
          );

          UPDATE profiles
          SET 
            battles_won = battles_won + 1,
            units_destroyed = units_destroyed + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0)
          WHERE id = fleet_record.user_id;

          UPDATE profiles
          SET 
            battles_lost = battles_lost + 1,
            units_lost = units_lost + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0)
          WHERE id = target_planet.user_id;

        ELSIF (combat_result->>'result') = 'defender_won' THEN
          DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;

          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining')
          LOOP
            IF (v_unit->>'is_defense')::boolean THEN
              UPDATE planet_defenses
              SET quantity = (v_unit->>'quantity')::integer
              WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
            ELSE
              UPDATE planet_ships
              SET quantity = (v_unit->>'quantity')::integer
              WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
            END IF;
          END LOOP;

          -- Use new function with Engineer bonus for defense rebuild
          PERFORM rebuild_destroyed_defenses(
            target_planet.id, 
            combat_result->'destroyed_defenses',
            target_planet.user_id
          );

          UPDATE profiles SET battles_lost = battles_lost + 1 WHERE id = fleet_record.user_id;
          UPDATE profiles SET battles_won = battles_won + 1 WHERE id = target_planet.user_id;

          loot_metal := 0;
          loot_crystal := 0;
          loot_deuterium := 0;

        ELSE
          DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining')
          LOOP
            IF (v_unit->>'quantity')::integer > 0 THEN
              INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
              VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer);
            END IF;
          END LOOP;

          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining')
          LOOP
            IF (v_unit->>'is_defense')::boolean THEN
              UPDATE planet_defenses
              SET quantity = (v_unit->>'quantity')::integer
              WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
            ELSE
              UPDATE planet_ships
              SET quantity = (v_unit->>'quantity')::integer
              WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
            END IF;
          END LOOP;

          -- Use new function with Engineer bonus for defense rebuild
          PERFORM rebuild_destroyed_defenses(
            target_planet.id, 
            combat_result->'destroyed_defenses',
            target_planet.user_id
          );

          UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = fleet_record.user_id;
          UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = target_planet.user_id;

          loot_metal := 0;
          loot_crystal := 0;
          loot_deuterium := 0;
        END IF;

        v_debris_metal := COALESCE((combat_result->>'debris_metal')::numeric, 0);
        v_debris_crystal := COALESCE((combat_result->>'debris_crystal')::numeric, 0);

        IF v_debris_metal > 0 OR v_debris_crystal > 0 THEN
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
            metal = debris_fields.metal + EXCLUDED.metal,
            crystal = debris_fields.crystal + EXCLUDED.crystal,
            updated_at = NOW();

          UPDATE profiles
          SET debris_metal_total = debris_metal_total + v_debris_metal,
              debris_crystal_total = debris_crystal_total + v_debris_crystal
          WHERE id = fleet_record.user_id;
        END IF;

        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL,
          fleet_record.user_id,
          format('Reporte de Combate - %s', 
            CASE (combat_result->>'result')
              WHEN 'attacker_won' THEN 'Victoria'
              WHEN 'defender_won' THEN 'Derrota'
              ELSE 'Empate'
            END),
          format('Combate en %s [%s:%s:%s]

Resultado: %s
Rondas: %s

Botin: %s Metal, %s Cristal, %s Deuterio
Escombros generados: %s Metal, %s Cristal

Perdidas del atacante: %s Metal, %s Cristal
Perdidas del defensor: %s Metal, %s Cristal',
            target_planet.name,
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            CASE (combat_result->>'result')
              WHEN 'attacker_won' THEN 'VICTORIA'
              WHEN 'defender_won' THEN 'DERROTA'
              ELSE 'EMPATE'
            END,
            (combat_result->>'rounds'),
            floor(COALESCE(loot_metal, 0)), floor(COALESCE(loot_crystal, 0)), floor(COALESCE(loot_deuterium, 0)),
            floor(v_debris_metal), floor(v_debris_crystal),
            floor(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), 
            floor(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0)),
            floor(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), 
            floor(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0))),
          'battle'
        );

        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
        VALUES (
          NULL,
          target_planet.user_id,
          format('Tu planeta %s fue atacado - %s', 
            target_planet.name,
            CASE (combat_result->>'result')
              WHEN 'attacker_won' THEN 'Derrota'
              WHEN 'defender_won' THEN 'Victoria'
              ELSE 'Empate'
            END),
          format('Tu planeta %s en [%s:%s:%s] fue atacado.

Resultado: %s
Rondas: %s

Recursos saqueados: %s Metal, %s Cristal, %s Deuterio
Escombros generados: %s Metal, %s Cristal

Tus perdidas: %s Metal, %s Cristal
Perdidas del atacante: %s Metal, %s Cristal

Las defensas destruidas tienen probabilidad de ser reconstruidas automaticamente.',
            target_planet.name,
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            CASE (combat_result->>'result')
              WHEN 'attacker_won' THEN 'DERROTA'
              WHEN 'defender_won' THEN 'VICTORIA'
              ELSE 'EMPATE'
            END,
            (combat_result->>'rounds'),
            floor(COALESCE(loot_metal, 0)), floor(COALESCE(loot_crystal, 0)), floor(COALESCE(loot_deuterium, 0)),
            floor(v_debris_metal), floor(v_debris_crystal),
            floor(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), 
            floor(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0)),
            floor(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), 
            floor(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0))),
          'battle'
        );

        IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN
          UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
        ELSE
          UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
        END IF;
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;

    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
END;
$$;