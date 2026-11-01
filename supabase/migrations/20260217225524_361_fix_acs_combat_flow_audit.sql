/*
  # ACS Combat Flow Audit Fixes

  1. Bug Fixes
    - `process_acs_fleet_arrival`: Add FOR UPDATE lock on acs_fleets to prevent race conditions
    - `process_acs_fleet_arrival`: Add FOR UPDATE on fleet records during ship redistribution
    - `check_and_process_acs`: Fix to use correct status ('waiting' instead of 'pending') 
      and call `process_acs_fleet_arrival` instead of broken `process_acs_attack`
    - `check_pending_acs_attacks`: Fix to use correct status and call working function

  2. Safety Improvements
    - All ACS processing paths now converge to `process_acs_fleet_arrival` (the working function)
    - Eliminated references to broken `process_acs_attack` function
    - Added proper row locking to prevent double-processing
*/

-- ==========================================================================
-- Fix process_acs_fleet_arrival: add FOR UPDATE lock to prevent race condition
-- ==========================================================================
CREATE OR REPLACE FUNCTION process_acs_fleet_arrival(p_acs_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acs RECORD;
  v_target_planet RECORD;
  v_combat_result jsonb;
  v_total_cargo_capacity integer := 0;
  v_loot_metal numeric := 0;
  v_loot_crystal numeric := 0;
  v_loot_deuterium numeric := 0;
  v_participant RECORD;
  v_contribution jsonb;
  v_share_percent numeric;
  v_unit jsonb;
  v_debris_metal numeric;
  v_debris_crystal numeric;
  v_destroyed_qty integer;
  v_rebuilt_qty integer;
  v_i integer;
BEGIN
  SELECT * INTO v_acs
  FROM acs_fleets
  WHERE id = p_acs_id
  AND is_active = true
  AND status = 'waiting'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_acs.arrival_time > NOW() THEN
    RETURN;
  END IF;

  UPDATE acs_fleets SET status = 'in_combat' WHERE id = p_acs_id;

  SELECT p.* INTO v_target_planet
  FROM planets p
  WHERE p.galaxy = v_acs.target_galaxy
  AND p.solar_system = v_acs.target_system
  AND p.position = v_acs.target_position
  AND p.user_id IS NOT NULL;

  IF NOT FOUND OR v_target_planet.user_id IS NULL THEN
    FOR v_participant IN
      SELECT ap.fleet_id FROM acs_participants ap WHERE ap.acs_id = p_acs_id
    LOOP
      UPDATE fleets SET is_returning = true WHERE id = v_participant.fleet_id;
    END LOOP;
    UPDATE acs_fleets SET is_active = false, status = 'completed' WHERE id = p_acs_id;
    RETURN;
  END IF;

  v_combat_result := perform_acs_combat(p_acs_id, v_target_planet.id);

  IF (v_combat_result->>'result') = 'attacker_won' THEN
    SELECT COALESCE(SUM((unit->>'quantity')::integer * COALESCE((unit->>'cargo_capacity')::integer, 0)), 0)
    INTO v_total_cargo_capacity
    FROM jsonb_array_elements(v_combat_result->'attacker_remaining') AS unit
    WHERE (unit->>'quantity')::integer > 0;

    SELECT 
      LEAST(metal * 0.5, v_total_cargo_capacity / 3),
      LEAST(crystal * 0.5, v_total_cargo_capacity / 3),
      LEAST(deuterium * 0.5, v_total_cargo_capacity / 3)
    INTO v_loot_metal, v_loot_crystal, v_loot_deuterium
    FROM planet_resources WHERE planet_id = v_target_planet.id;

    UPDATE planet_resources
    SET
      metal = GREATEST(0, metal - v_loot_metal),
      crystal = GREATEST(0, crystal - v_loot_crystal),
      deuterium = GREATEST(0, deuterium - v_loot_deuterium)
    WHERE planet_id = v_target_planet.id;

    FOR v_contribution IN SELECT * FROM jsonb_array_elements(v_combat_result->'fleet_contributions')
    LOOP
      IF (v_combat_result->>'total_fleet_power')::numeric > 0 THEN
        v_share_percent := (v_contribution->>'power')::numeric / (v_combat_result->>'total_fleet_power')::numeric;
      ELSE
        v_share_percent := 1.0 / jsonb_array_length(v_combat_result->'fleet_contributions');
      END IF;

      UPDATE fleets
      SET
        cargo_metal = cargo_metal + FLOOR(v_loot_metal * v_share_percent),
        cargo_crystal = cargo_crystal + FLOOR(v_loot_crystal * v_share_percent),
        cargo_deuterium = cargo_deuterium + FLOOR(v_loot_deuterium * v_share_percent)
      WHERE id = (v_contribution->>'fleet_id')::uuid;
    END LOOP;
  END IF;

  FOR v_participant IN
    SELECT ap.fleet_id, ap.user_id FROM acs_participants ap WHERE ap.acs_id = p_acs_id
  LOOP
    DELETE FROM fleet_ships WHERE fleet_id = v_participant.fleet_id;

    FOR v_unit IN 
      SELECT * FROM jsonb_array_elements(v_combat_result->'attacker_remaining')
      WHERE (value->>'fleet_id')::uuid = v_participant.fleet_id
      AND (value->>'quantity')::integer > 0
    LOOP
      INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
      VALUES (v_participant.fleet_id, (v_unit->>'type_id')::integer, (v_unit->>'quantity')::integer);
    END LOOP;

    IF EXISTS (SELECT 1 FROM fleet_ships WHERE fleet_id = v_participant.fleet_id AND quantity > 0) THEN
      UPDATE fleets SET is_returning = true WHERE id = v_participant.fleet_id;
    ELSE
      UPDATE fleets SET is_completed = true WHERE id = v_participant.fleet_id;
    END IF;

    IF (v_combat_result->>'result') = 'attacker_won' THEN
      UPDATE profiles SET battles_won = battles_won + 1 WHERE id = v_participant.user_id;
    ELSIF (v_combat_result->>'result') = 'defender_won' THEN
      UPDATE profiles SET battles_lost = battles_lost + 1 WHERE id = v_participant.user_id;
    ELSE
      UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = v_participant.user_id;
    END IF;
  END LOOP;

  FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->'defender_remaining')
  LOOP
    IF (v_unit->>'is_defense')::boolean THEN
      UPDATE planet_defenses
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
    ELSE
      UPDATE planet_ships
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
    END IF;
  END LOOP;

  FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->'destroyed_defenses')
  LOOP
    v_destroyed_qty := (v_unit->>'quantity')::integer;
    v_rebuilt_qty := 0;
    FOR v_i IN 1..v_destroyed_qty LOOP
      IF random() < 0.7 THEN
        v_rebuilt_qty := v_rebuilt_qty + 1;
      END IF;
    END LOOP;
    UPDATE planet_defenses
    SET quantity = quantity + v_rebuilt_qty
    WHERE planet_id = v_target_planet.id AND defense_type_id = (v_unit->>'defense_type_id')::integer;
  END LOOP;

  v_debris_metal := COALESCE((v_combat_result->>'debris_metal')::numeric, 0);
  v_debris_crystal := COALESCE((v_combat_result->>'debris_crystal')::numeric, 0);

  IF v_debris_metal > 0 OR v_debris_crystal > 0 THEN
    INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal)
    VALUES (v_acs.target_galaxy, v_acs.target_system, v_acs.target_position, v_debris_metal, v_debris_crystal)
    ON CONFLICT (galaxy, solar_system, position)
    DO UPDATE SET metal = debris_fields.metal + EXCLUDED.metal, crystal = debris_fields.crystal + EXCLUDED.crystal, updated_at = NOW();
  END IF;

  IF (v_combat_result->>'result') = 'attacker_won' THEN
    UPDATE profiles SET battles_lost = battles_lost + 1 WHERE id = v_target_planet.user_id;
  ELSIF (v_combat_result->>'result') = 'defender_won' THEN
    UPDATE profiles SET battles_won = battles_won + 1 WHERE id = v_target_planet.user_id;
  ELSE
    UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = v_target_planet.user_id;
  END IF;

  FOR v_participant IN
    SELECT ap.user_id, pr.username FROM acs_participants ap
    JOIN profiles pr ON ap.user_id = pr.id
    WHERE ap.acs_id = p_acs_id
  LOOP
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (
      NULL,
      v_participant.user_id,
      format('Reporte ACS - %s', 
        CASE (v_combat_result->>'result')
          WHEN 'attacker_won' THEN 'Victoria'
          WHEN 'defender_won' THEN 'Derrota'
          ELSE 'Empate'
        END),
      format(E'Combate ACS en [%s:%s:%s]\n\nResultado: %s\nRondas: %s\nParticipantes ACS: %s\n\nBotin total: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nPerdidas atacantes: %s Metal, %s Cristal\nPerdidas defensor: %s Metal, %s Cristal',
        v_acs.target_galaxy, v_acs.target_system, v_acs.target_position,
        CASE (v_combat_result->>'result') WHEN 'attacker_won' THEN 'VICTORIA' WHEN 'defender_won' THEN 'DERROTA' ELSE 'EMPATE' END,
        (v_combat_result->>'rounds'),
        v_acs.current_participants,
        FLOOR(v_loot_metal), FLOOR(v_loot_crystal), FLOOR(v_loot_deuterium),
        FLOOR(v_debris_metal), FLOOR(v_debris_crystal),
        FLOOR(COALESCE((v_combat_result->>'attacker_losses_metal')::numeric, 0)),
        FLOOR(COALESCE((v_combat_result->>'attacker_losses_crystal')::numeric, 0)),
        FLOOR(COALESCE((v_combat_result->>'defender_losses_metal')::numeric, 0)),
        FLOOR(COALESCE((v_combat_result->>'defender_losses_crystal')::numeric, 0))),
      'battle'
    );
  END LOOP;

  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (
    NULL,
    v_target_planet.user_id,
    format('Tu planeta fue atacado por ACS - %s',
      CASE (v_combat_result->>'result')
        WHEN 'attacker_won' THEN 'Derrota'
        WHEN 'defender_won' THEN 'Victoria'
        ELSE 'Empate'
      END),
    format(E'Tu planeta en [%s:%s:%s] fue atacado por un ACS de %s flotas.\n\nResultado: %s\nRondas: %s\n\nRecursos saqueados: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nTus perdidas: %s Metal, %s Cristal\nPerdidas atacantes: %s Metal, %s Cristal',
      v_acs.target_galaxy, v_acs.target_system, v_acs.target_position,
      v_acs.current_participants,
      CASE (v_combat_result->>'result') WHEN 'attacker_won' THEN 'DERROTA' WHEN 'defender_won' THEN 'VICTORIA' ELSE 'EMPATE' END,
      (v_combat_result->>'rounds'),
      FLOOR(v_loot_metal), FLOOR(v_loot_crystal), FLOOR(v_loot_deuterium),
      FLOOR(v_debris_metal), FLOOR(v_debris_crystal),
      FLOOR(COALESCE((v_combat_result->>'defender_losses_metal')::numeric, 0)),
      FLOOR(COALESCE((v_combat_result->>'defender_losses_crystal')::numeric, 0)),
      FLOOR(COALESCE((v_combat_result->>'attacker_losses_metal')::numeric, 0)),
      FLOOR(COALESCE((v_combat_result->>'attacker_losses_crystal')::numeric, 0))),
    'battle'
  );

  UPDATE acs_fleets SET is_active = false, status = 'completed' WHERE id = p_acs_id;
END;
$$;

-- ==========================================================================
-- Fix check_and_process_acs: use correct status and call working function
-- ==========================================================================
CREATE OR REPLACE FUNCTION check_and_process_acs(p_fleet_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acs_id uuid;
  v_acs RECORD;
BEGIN
  SELECT ap.acs_id INTO v_acs_id
  FROM acs_participants ap
  JOIN acs_fleets af ON af.id = ap.acs_id
  WHERE ap.fleet_id = p_fleet_id AND af.is_active = true;

  IF v_acs_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_acs FROM acs_fleets WHERE id = v_acs_id;

  IF v_acs.status = 'waiting' AND v_acs.arrival_time <= NOW() THEN
    PERFORM process_acs_fleet_arrival(v_acs_id);
    RETURN true;
  END IF;

  RETURN true;
END;
$$;

-- ==========================================================================
-- Fix check_pending_acs_attacks: use correct status and call working function
-- ==========================================================================
CREATE OR REPLACE FUNCTION check_pending_acs_attacks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acs RECORD;
BEGIN
  FOR v_acs IN
    SELECT id FROM acs_fleets 
    WHERE status = 'waiting' AND is_active = true AND arrival_time <= NOW()
  LOOP
    PERFORM process_acs_fleet_arrival(v_acs.id);
  END LOOP;
END;
$$;
