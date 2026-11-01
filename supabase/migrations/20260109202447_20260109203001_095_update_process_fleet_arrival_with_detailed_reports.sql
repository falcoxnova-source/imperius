/*
  # Actualizar process_fleet_arrival con Reportes Detallados

  1. Propósito
    - Integrar format_unit_report en los reportes de batalla
    - Mantener toda la lógica de combate existente
    - Solo mejorar la presentación de los reportes
*/

CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
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
BEGIN
  SELECT * INTO fleet_record FROM fleets WHERE id = p_fleet_id AND is_completed = false;
  IF NOT FOUND THEN RETURN; END IF;

  IF fleet_record.arrival_time > NOW() AND NOT fleet_record.is_returning THEN RETURN; END IF;
  IF fleet_record.is_returning AND fleet_record.return_time > NOW() THEN RETURN; END IF;

  IF fleet_record.is_returning THEN
    FOR ship_record IN SELECT fs.ship_type_id, fs.quantity FROM fleet_ships fs WHERE fs.fleet_id = p_fleet_id
    LOOP
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity) VALUES (fleet_record.origin_planet_id, ship_record.ship_type_id, ship_record.quantity)
      ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
    END LOOP;
    UPDATE planet_resources SET metal = metal + fleet_record.cargo_metal, crystal = crystal + fleet_record.cargo_crystal, deuterium = deuterium + fleet_record.cargo_deuterium WHERE planet_id = fleet_record.origin_planet_id;
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    RETURN;
  END IF;

  CASE fleet_record.mission_type
    WHEN 'attack' THEN
      SELECT p.* INTO target_planet FROM planets p WHERE p.galaxy = fleet_record.target_galaxy AND p.solar_system = fleet_record.target_system AND p.position = fleet_record.target_position;
      IF FOUND AND target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
        combat_result := perform_combat(p_fleet_id, target_planet.id);
        v_attacker_units_report := format_unit_report(combat_result->'initial_attacker', combat_result->'attacker_remaining', 'attacker');
        v_defender_units_report := format_unit_report(combat_result->'initial_defender', combat_result->'defender_remaining', 'defender');

        IF (combat_result->>'result') = 'attacker_won' THEN
          SELECT COALESCE(SUM((unit->>'quantity')::integer * (SELECT cargo_capacity FROM ship_types WHERE id = (unit->>'type_id')::integer)), 0) INTO total_cargo_capacity
          FROM jsonb_array_elements(combat_result->'attacker_remaining') AS unit WHERE (unit->>'quantity')::integer > 0;
          SELECT LEAST(metal * 0.5, total_cargo_capacity / 3), LEAST(crystal * 0.5, total_cargo_capacity / 3), LEAST(deuterium * 0.5, total_cargo_capacity / 3) INTO loot_metal, loot_crystal, loot_deuterium FROM planet_resources WHERE planet_id = target_planet.id;
          UPDATE planet_resources SET metal = GREATEST(0, metal - loot_metal), crystal = GREATEST(0, crystal - loot_crystal), deuterium = GREATEST(0, deuterium - loot_deuterium) WHERE planet_id = target_planet.id;
          UPDATE fleets SET cargo_metal = cargo_metal + loot_metal, cargo_crystal = cargo_crystal + loot_crystal, cargo_deuterium = cargo_deuterium + loot_deuterium WHERE id = p_fleet_id;
          DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining') LOOP
            IF (v_unit->>'quantity')::integer > 0 THEN INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer); END IF;
          END LOOP;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
            IF NOT (v_unit->>'is_defense')::boolean THEN UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; END IF;
          END LOOP;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP
            DECLARE v_destroyed_qty INTEGER := (v_unit->>'quantity')::integer; v_rebuilt_qty INTEGER := 0; v_i INTEGER;
            BEGIN FOR v_i IN 1..v_destroyed_qty LOOP IF random() < 0.7 THEN v_rebuilt_qty := v_rebuilt_qty + 1; END IF; END LOOP;
              UPDATE planet_defenses SET quantity = GREATEST(0, quantity - v_destroyed_qty + v_rebuilt_qty) WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
            END;
          END LOOP;
          UPDATE profiles SET battles_won = battles_won + 1, units_destroyed = units_destroyed + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0) WHERE id = fleet_record.user_id;
          UPDATE profiles SET battles_lost = battles_lost + 1, units_lost = units_lost + COALESCE((combat_result->>'defender_losses_metal')::bigint / 1000, 0) WHERE id = target_planet.user_id;
        ELSIF (combat_result->>'result') = 'defender_won' THEN
          DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
            IF (v_unit->>'is_defense')::boolean THEN UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
            ELSE UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; END IF;
          END LOOP;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP
            DECLARE v_destroyed_qty INTEGER := (v_unit->>'quantity')::integer; v_rebuilt_qty INTEGER := 0; v_i INTEGER;
            BEGIN FOR v_i IN 1..v_destroyed_qty LOOP IF random() < 0.7 THEN v_rebuilt_qty := v_rebuilt_qty + 1; END IF; END LOOP;
              UPDATE planet_defenses SET quantity = quantity + v_rebuilt_qty WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
            END;
          END LOOP;
          UPDATE profiles SET battles_lost = battles_lost + 1 WHERE id = fleet_record.user_id;
          UPDATE profiles SET battles_won = battles_won + 1 WHERE id = target_planet.user_id;
          loot_metal := 0; loot_crystal := 0; loot_deuterium := 0;
        ELSE
          DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'attacker_remaining') LOOP
            IF (v_unit->>'quantity')::integer > 0 THEN INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity) VALUES (p_fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer); END IF;
          END LOOP;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'defender_remaining') LOOP
            IF (v_unit->>'is_defense')::boolean THEN UPDATE planet_defenses SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
            ELSE UPDATE planet_ships SET quantity = (v_unit->>'quantity')::integer WHERE planet_id = target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer; END IF;
          END LOOP;
          FOR v_unit IN SELECT * FROM jsonb_array_elements(combat_result->'destroyed_defenses') LOOP
            DECLARE v_destroyed_qty INTEGER := (v_unit->>'quantity')::integer; v_rebuilt_qty INTEGER := 0; v_i INTEGER;
            BEGIN FOR v_i IN 1..v_destroyed_qty LOOP IF random() < 0.7 THEN v_rebuilt_qty := v_rebuilt_qty + 1; END IF; END LOOP;
              UPDATE planet_defenses SET quantity = quantity + v_rebuilt_qty WHERE planet_id = target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
            END;
          END LOOP;
          UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = fleet_record.user_id;
          UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = target_planet.user_id;
          loot_metal := 0; loot_crystal := 0; loot_deuterium := 0;
        END IF;

        v_debris_metal := COALESCE((combat_result->>'debris_metal')::numeric, 0);
        v_debris_crystal := COALESCE((combat_result->>'debris_crystal')::numeric, 0);
        IF v_debris_metal > 0 OR v_debris_crystal > 0 THEN
          INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal) VALUES (fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position, v_debris_metal, v_debris_crystal)
          ON CONFLICT (galaxy, solar_system, position) DO UPDATE SET metal = debris_fields.metal + EXCLUDED.metal, crystal = debris_fields.crystal + EXCLUDED.crystal, updated_at = NOW();
          UPDATE profiles SET debris_metal_total = debris_metal_total + v_debris_metal, debris_crystal_total = debris_crystal_total + v_debris_crystal WHERE id = fleet_record.user_id;
        END IF;

        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) VALUES (NULL, fleet_record.user_id,
          format('Reporte de Combate - %s', CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'Victoria' WHEN 'defender_won' THEN 'Derrota' ELSE 'Empate' END),
          format(E'Combate en %s [%s:%s:%s]\n\nResultado: %s\nRondas: %s\n\n=== TUS FUERZAS ===\n%s\n\n=== FUERZAS ENEMIGAS ===\n%s\n\nBotin: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nPerdidas del atacante: %s Metal, %s Cristal\nPerdidas del defensor: %s Metal, %s Cristal',
            target_planet.name, fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'VICTORIA' WHEN 'defender_won' THEN 'DERROTA' ELSE 'EMPATE' END,
            (combat_result->>'rounds'), v_attacker_units_report, v_defender_units_report,
            floor(COALESCE(loot_metal, 0)), floor(COALESCE(loot_crystal, 0)), floor(COALESCE(loot_deuterium, 0)),
            floor(v_debris_metal), floor(v_debris_crystal),
            floor(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0)),
            floor(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0))), 'battle');

        INSERT INTO messages (sender_id, recipient_id, subject, body, message_type) VALUES (NULL, target_planet.user_id,
          format('Tu planeta %s fue atacado - %s', target_planet.name, CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'Derrota' WHEN 'defender_won' THEN 'Victoria' ELSE 'Empate' END),
          format(E'Tu planeta %s en [%s:%s:%s] fue atacado.\n\nResultado: %s\nRondas: %s\n\n=== TUS FUERZAS ===\n%s\n\n=== FUERZAS ATACANTES ===\n%s\n\nRecursos saqueados: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nTus perdidas: %s Metal, %s Cristal\nPerdidas del atacante: %s Metal, %s Cristal\n\nLas defensas destruidas tienen 70%% de probabilidad de ser reconstruidas automaticamente.',
            target_planet.name, fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            CASE (combat_result->>'result') WHEN 'attacker_won' THEN 'DERROTA' WHEN 'defender_won' THEN 'VICTORIA' ELSE 'EMPATE' END,
            (combat_result->>'rounds'), v_defender_units_report, v_attacker_units_report,
            floor(COALESCE(loot_metal, 0)), floor(COALESCE(loot_crystal, 0)), floor(COALESCE(loot_deuterium, 0)),
            floor(v_debris_metal), floor(v_debris_crystal),
            floor(COALESCE((combat_result->>'defender_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'defender_losses_crystal')::numeric, 0)),
            floor(COALESCE((combat_result->>'attacker_losses_metal')::numeric, 0)), floor(COALESCE((combat_result->>'attacker_losses_crystal')::numeric, 0))), 'battle');

        IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity > 0) THEN UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
        ELSE UPDATE fleets SET is_completed = true WHERE id = p_fleet_id; END IF;
      ELSE UPDATE fleets SET is_returning = true WHERE id = p_fleet_id; END IF;
    ELSE UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION process_fleet_arrival(uuid) TO authenticated;
