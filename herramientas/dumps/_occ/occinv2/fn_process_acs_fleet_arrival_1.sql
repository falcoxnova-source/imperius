CREATE OR REPLACE FUNCTION public.process_acs_fleet_arrival(p_acs_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acs RECORD;
  v_target_planet RECORD;
  v_combat_result jsonb;
  v_building_damage jsonb;
  v_bdmg_note text := '';
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
  v_attacker_units_report text;
  v_defender_units_report text;
  v_attacker_names text;
  v_moon_result jsonb;
  v_def_body text;
  v_share numeric;
  v_c jsonb;
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

  v_attacker_units_report := format_unit_report(v_combat_result->'initial_attacker', v_combat_result->'attacker_remaining', 'attacker');
  v_defender_units_report := format_unit_report(v_combat_result->'initial_defender', v_combat_result->'defender_remaining', 'defender');

  SELECT string_agg(pr.username, ', ')
  INTO v_attacker_names
  FROM acs_participants ap
  JOIN profiles pr ON ap.user_id = pr.id
  WHERE ap.acs_id = p_acs_id;

  IF (v_combat_result->>'result') = 'attacker_won' THEN
    SELECT COALESCE(SUM((unit->>'quantity')::integer * COALESCE((unit->>'cargo_capacity')::integer, 0)), 0)
    INTO v_total_cargo_capacity
    FROM jsonb_array_elements(v_combat_result->'attacker_remaining') AS unit
    WHERE (unit->>'quantity')::integer > 0;

    DECLARE v_am NUMERIC; v_ac NUMERIC; v_ad NUMERIC; v_rm NUMERIC; BEGIN SELECT GREATEST(0, COALESCE(metal, 0)), GREATEST(0, COALESCE(crystal, 0)), GREATEST(0, COALESCE(deuterium, 0)) INTO v_am, v_ac, v_ad FROM planet_resources WHERE planet_id = v_target_planet.id; v_loot_metal := LEAST(v_am, FLOOR(v_total_cargo_capacity::numeric / 3)); v_loot_crystal := LEAST(v_ac, FLOOR(v_total_cargo_capacity::numeric / 3)); v_loot_deuterium := LEAST(v_ad, FLOOR(v_total_cargo_capacity::numeric / 3)); v_rm := v_total_cargo_capacity - (v_loot_metal + v_loot_crystal + v_loot_deuterium); IF v_rm > 0 THEN v_loot_metal := v_loot_metal + LEAST(v_am - v_loot_metal, v_rm); v_rm := v_total_cargo_capacity - (v_loot_metal + v_loot_crystal + v_loot_deuterium); END IF; IF v_rm > 0 THEN v_loot_crystal := v_loot_crystal + LEAST(v_ac - v_loot_crystal, v_rm); v_rm := v_total_cargo_capacity - (v_loot_metal + v_loot_crystal + v_loot_deuterium); END IF; IF v_rm > 0 THEN v_loot_deuterium := v_loot_deuterium + LEAST(v_ad - v_loot_deuterium, v_rm); END IF; END;

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
      WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer AND COALESCE(v_unit->>'source', 'planet') = 'planet';
    END IF;
  END LOOP;

  -- [ACSPARITY1] Perdidas de flotas aliadas estacionadas (patron [FLOTAS v17]: fila vacia se borra)
  FOR v_unit IN
    SELECT * FROM jsonb_array_elements(v_combat_result->'defender_remaining')
    WHERE NOT COALESCE((value->>'is_defense')::boolean, false)
      AND COALESCE(value->>'source', 'planet') NOT IN ('planet', 'defense')
  LOOP
    IF (v_unit->>'quantity')::integer > 0 THEN
      UPDATE fleet_ships SET quantity = (v_unit->>'quantity')::integer
      WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer;
    ELSE
      DELETE FROM fleet_ships
      WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer;
    END IF;
  END LOOP;
  UPDATE fleets SET is_completed = true
  WHERE mission_type = 'deploy' AND is_completed = false
    AND id IN (SELECT (u->>'source')::uuid FROM jsonb_array_elements(v_combat_result->'defender_remaining') u
               WHERE COALESCE(u->>'source', 'planet') NOT IN ('planet', 'defense'))
    AND NOT EXISTS (SELECT 1 FROM fleet_ships fs WHERE fs.fleet_id = fleets.id AND fs.quantity > 0);

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
    IF COALESCE((SELECT SUM((u->>'quantity')::bigint) FROM jsonb_array_elements(v_combat_result->'initial_defender') u), 0) > 0
       AND COALESCE((SELECT SUM((u->>'quantity')::bigint) FROM jsonb_array_elements(v_combat_result->'defender_remaining') u), 0) = 0 THEN
      v_building_damage := apply_attack_building_damage(v_target_planet.id);
      IF v_building_damage IS NOT NULL AND (v_building_damage->>'damaged')::boolean THEN
        v_bdmg_note := chr(10) || chr(10) || 'Daño estructural: ' || (v_building_damage->>'building_name') || ' del planeta ' || v_target_planet.name || ' bajó al nivel ' || (v_building_damage->>'new_level') || '.';
      END IF;
    END IF;
  ELSIF (v_combat_result->>'result') = 'defender_won' THEN
    UPDATE profiles SET battles_won = battles_won + 1 WHERE id = v_target_planet.user_id;
  ELSE
    UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = v_target_planet.user_id;
  END IF;

  -- [ACSPARITY1] Formacion de luna (igual que el ataque normal)
  BEGIN
    v_moon_result := check_moon_creation(v_acs.target_galaxy, v_acs.target_system, v_acs.target_position, COALESCE(v_debris_metal, 0), COALESCE(v_debris_crystal, 0));
  EXCEPTION WHEN OTHERS THEN
    v_moon_result := NULL;
  END;
  IF v_moon_result IS NOT NULL AND COALESCE((v_moon_result->>'moon_chance')::numeric, 0) > 0 THEN
    v_bdmg_note := v_bdmg_note || chr(10) || chr(10)
      || format('Probabilidad de luna: %s%%', round((v_moon_result->>'moon_chance')::numeric, 2))
      || CASE WHEN COALESCE((v_moon_result->>'moon_created')::boolean, false)
              THEN format(' - Los escombros formaron una luna de %s km!', v_moon_result->>'moon_diameter')
              ELSE ' - No se formo luna.' END;
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
      format(E'Combate ACS en [%s:%s:%s]\n\nResultado: %s\nRondas: %s\nParticipantes ACS: %s\n\n=== FUERZAS ATACANTES ===\n%s\n\n=== FUERZAS DEFENSORAS ===\n%s\n\nBotin total: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nPerdidas atacantes: %s Metal, %s Cristal\nPerdidas defensor: %s Metal, %s Cristal\n\nLas defensas destruidas tienen 70%% de probabilidad de ser reconstruidas automaticamente.',
        v_acs.target_galaxy, v_acs.target_system, v_acs.target_position,
        CASE (v_combat_result->>'result') WHEN 'attacker_won' THEN 'VICTORIA' WHEN 'defender_won' THEN 'DERROTA' ELSE 'EMPATE' END,
        (v_combat_result->>'rounds'),
        v_acs.current_participants,
        v_attacker_units_report,
        v_defender_units_report,
        FLOOR(v_loot_metal), FLOOR(v_loot_crystal), FLOOR(v_loot_deuterium),
        FLOOR(v_debris_metal), FLOOR(v_debris_crystal),
        FLOOR(COALESCE((v_combat_result->>'attacker_losses_metal')::numeric, 0)),
        FLOOR(COALESCE((v_combat_result->>'attacker_losses_crystal')::numeric, 0)),
        FLOOR(COALESCE((v_combat_result->>'defender_losses_metal')::numeric, 0)),
        FLOOR(COALESCE((v_combat_result->>'defender_losses_crystal')::numeric, 0))) || v_bdmg_note,
      'battle'
    );
  END LOOP;

  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (
    NULL,
    v_target_planet.user_id,
    format('Tu planeta fue atacado por ACS (%s) - %s',
      COALESCE(v_attacker_names, 'Desconocido'),
      CASE (v_combat_result->>'result')
        WHEN 'attacker_won' THEN 'Derrota'
        WHEN 'defender_won' THEN 'Victoria'
        ELSE 'Empate'
      END),
    format(E'Tu planeta en [%s:%s:%s] fue atacado por un ACS de %s flotas.\nAtacantes: %s\n\nResultado: %s\nRondas: %s\n\n=== TUS FUERZAS ===\n%s\n\n=== FUERZAS ATACANTES ===\n%s\n\nRecursos saqueados: %s Metal, %s Cristal, %s Deuterio\nEscombros generados: %s Metal, %s Cristal\n\nTus perdidas: %s Metal, %s Cristal\nPerdidas atacantes: %s Metal, %s Cristal\n\nLas defensas destruidas tienen 70%% de probabilidad de ser reconstruidas automaticamente.',
      v_acs.target_galaxy, v_acs.target_system, v_acs.target_position,
      v_acs.current_participants,
      COALESCE(v_attacker_names, 'Desconocido'),
      CASE (v_combat_result->>'result') WHEN 'attacker_won' THEN 'DERROTA' WHEN 'defender_won' THEN 'VICTORIA' ELSE 'EMPATE' END,
      (v_combat_result->>'rounds'),
      v_defender_units_report,
      v_attacker_units_report,
      FLOOR(v_loot_metal), FLOOR(v_loot_crystal), FLOOR(v_loot_deuterium),
      FLOOR(v_debris_metal), FLOOR(v_debris_crystal),
      FLOOR(COALESCE((v_combat_result->>'defender_losses_metal')::numeric, 0)),
      FLOOR(COALESCE((v_combat_result->>'defender_losses_crystal')::numeric, 0)),
      FLOOR(COALESCE((v_combat_result->>'attacker_losses_metal')::numeric, 0)),
      FLOOR(COALESCE((v_combat_result->>'attacker_losses_crystal')::numeric, 0))) || v_bdmg_note,
    'battle'
  )
  RETURNING body INTO v_def_body;

  -- [ACSPARITY1] Copia del reporte para aliados cuyas flotas estacionadas defendieron
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  SELECT NULL, f.user_id,
         format('Tu flota defendio %s - %s', v_target_planet.name,
           CASE (v_combat_result->>'result') WHEN 'attacker_won' THEN 'Derrota' WHEN 'defender_won' THEN 'Victoria' ELSE 'Empate' END),
         v_def_body, 'battle'
  FROM fleets f
  WHERE f.id IN (SELECT DISTINCT (u->>'source')::uuid FROM jsonb_array_elements(v_combat_result->'defender_remaining') u
                 WHERE COALESCE(u->>'source', 'planet') NOT IN ('planet', 'defense'))
    AND f.user_id <> v_target_planet.user_id
  GROUP BY f.user_id;

  -- [ACSPARITY1] battle_reports: una fila por participante con SU flota; 'acs_share' (potencia)
  -- pondera la destruccion del defensor en get_destruction_ranking. battle_type='acs' no afecta bashing.
  FOR v_c IN SELECT * FROM jsonb_array_elements(v_combat_result->'fleet_contributions')
  LOOP
    IF COALESCE((v_combat_result->>'total_fleet_power')::numeric, 0) > 0 THEN
      v_share := (v_c->>'power')::numeric / (v_combat_result->>'total_fleet_power')::numeric;
    ELSE
      v_share := 1.0 / GREATEST(1, jsonb_array_length(v_combat_result->'fleet_contributions'));
    END IF;

    INSERT INTO battle_reports (attacker_id, defender_id, planet_id, coordinates, result, rounds, debris_metal, debris_crystal, loot_metal, loot_crystal, loot_deuterium, report_data, battle_type, galaxy, solar_system, position, created_at)
    VALUES (
      (v_c->>'user_id')::uuid, v_target_planet.user_id, v_target_planet.id,
      v_acs.target_galaxy || ':' || v_acs.target_system || ':' || v_acs.target_position,
      v_combat_result->>'result', COALESCE((v_combat_result->>'rounds')::integer, 0),
      FLOOR(COALESCE(v_debris_metal, 0) * v_share), FLOOR(COALESCE(v_debris_crystal, 0) * v_share),
      FLOOR(COALESCE(v_loot_metal, 0) * v_share), FLOOR(COALESCE(v_loot_crystal, 0) * v_share), FLOOR(COALESCE(v_loot_deuterium, 0) * v_share),
      (v_combat_result - 'fleet_contributions' - 'total_fleet_power') || jsonb_build_object(
        'initial_attacker', COALESCE((SELECT jsonb_agg(u) FROM jsonb_array_elements(v_combat_result->'initial_attacker') u WHERE u->>'fleet_id' = v_c->>'fleet_id'), '[]'::jsonb),
        'attacker_remaining', COALESCE((SELECT jsonb_agg(u) FROM jsonb_array_elements(v_combat_result->'attacker_remaining') u WHERE u->>'fleet_id' = v_c->>'fleet_id'), '[]'::jsonb),
        'acs_id', p_acs_id,
        'acs_share', round(v_share, 6),
        'acs_participants', v_attacker_names,
        'moon', v_moon_result),
      'acs', v_acs.target_galaxy, v_acs.target_system, v_acs.target_position, now());
  END LOOP;

  UPDATE acs_fleets SET is_active = false, status = 'completed' WHERE id = p_acs_id;
END;
$function$

