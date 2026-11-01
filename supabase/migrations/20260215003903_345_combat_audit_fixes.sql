/*
  # Combat System Audit Fixes

  4 targeted fixes from combat audit, no other logic changed.

  1. Drop orphaned function
    - `calculate_rapid_fire_shots(text, text, jsonb)` is no longer called
      by `simulate_xnova_combat` (rapid fire handled inline since migration 325)

  2. Fix defender debris stats
    - `profiles.debris_metal_total` and `debris_crystal_total` were only updated
      for the attacker after combat; now also updated for the defender

  3. Restore attacker identity in defender battle report
    - Defender message now shows attacker username and origin coordinates
    - Lost in migration 340 when `process_fleet_arrival` was rewritten

  4. Rebalance Falco-X Clasica shield
    - Shield reduced from 1,200,000 to 150,000 (original migration 334 value)
    - Bounce threshold drops from 12,000 to 1,500
    - Destroyers (2,000 weapon), Plasma Turrets (3,000), and all capital ships
      can now damage it; still immune to light fighters and small ships
    - Weapon (1,500,000) and hull (20,000,000) unchanged

  ## Important Notes
  - No tables created or dropped
  - No RLS changes
  - `process_fleet_arrival` is fully recreated with only the 2 minimal changes
    (defender debris + attacker identity); all other logic is byte-identical
*/

-- ==========================================================================
-- Fix 1: Drop orphaned calculate_rapid_fire_shots function
-- ==========================================================================
DROP FUNCTION IF EXISTS calculate_rapid_fire_shots(text, text, jsonb);

-- ==========================================================================
-- Fix 4: Rebalance Falco-X Clasica shield (restore original design value)
-- ==========================================================================
UPDATE ship_types
SET shield_power = 150000
WHERE code = 'falco_x_clasica';

-- ==========================================================================
-- Fix 2 + Fix 3: Update process_fleet_arrival
--   - Add defender debris_metal_total / debris_crystal_total tracking
--   - Add attacker name + origin coords to defender battle report
-- ==========================================================================
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

        SELECT LEAST(metal * 0.5, total_cargo_capacity / 3),
               LEAST(crystal * 0.5, total_cargo_capacity / 3),
               LEAST(deuterium * 0.5, total_cargo_capacity / 3)
        INTO loot_metal, loot_crystal, loot_deuterium
        FROM planet_resources WHERE planet_id = target_planet.id;

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

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
          IF NOT (v_unit->>'is_defense')::boolean THEN
            UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
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

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
          IF (v_unit->>'is_defense')::boolean THEN
            UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
          ELSE
            UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
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

        FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
          IF (v_unit->>'is_defense')::boolean THEN
            UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
          ELSE
            UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer
            WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
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
          floor(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0))),
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
          floor(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0))),
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
    SELECT p.* INTO target_planet
    FROM planets p
    WHERE p.galaxy = fleet_record.target_galaxy
    AND p.solar_system = fleet_record.target_system
    AND p.position = fleet_record.target_position
    AND p.user_id = fleet_record.user_id;

    IF FOUND THEN
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
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
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
