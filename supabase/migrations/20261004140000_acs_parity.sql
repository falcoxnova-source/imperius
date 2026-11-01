-- [ACSPARITY1] Paridad del combate ACS con el ataque normal:
--   1) Flotas aliadas estacionadas (deploy) defienden tambien contra ACS.
--   2) Probabilidad de luna tras el combate ACS.
--   3) Registro en battle_reports (ranking de destruccion / top batallas).
--      Una fila por participante con SU flota y battle_type='acs'; el ranking
--      pondera la destruccion del defensor por 'acs_share' para no contarla N veces.
-- Parches in-place (pg_get_functiondef + replace) para no tocar el resto de la logica.

CREATE OR REPLACE FUNCTION pg_temp._acsp_rep(p_src text, p_old text, p_new text)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int;
BEGIN
  n := (length(p_src) - length(replace(p_src, p_old, ''))) / GREATEST(length(p_old), 1);
  IF n <> 1 THEN
    RAISE EXCEPTION '[ACSPARITY1] anchor encontrado % veces: %', n, left(p_old, 80);
  END IF;
  RETURN replace(p_src, p_old, p_new);
END $f$;

-- 1) perform_acs_combat: aliados estacionados como unidades defensoras
DO $do$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.perform_acs_combat(uuid,uuid)'::regprocedure);
  src := replace(src, E'\r\n', E'\n');  -- normaliza CRLF para que los anchors coincidan
  IF position('[ACSPARITY1]' in src) > 0 THEN
    RAISE NOTICE 'perform_acs_combat ya parcheado';
    RETURN;
  END IF;

  src := pg_temp._acsp_rep(src, $r$  v_unit jsonb;$r$, $r$  v_unit jsonb;
  v_allied_fleet RECORD;$r$);

  src := pg_temp._acsp_rep(src, $r$  v_combat_result := simulate_xnova_combat(v_attacker_units, v_defender_units);$r$, $r$  -- [ACSPARITY1] Flotas aliadas estacionadas (deploy) en el planeta defienden igual que en perform_combat
  FOR v_allied_fleet IN
    SELECT f.id AS fleet_id, f.user_id AS ally_user_id
    FROM fleets f
    JOIN planets tp ON tp.id = p_target_planet_id
    WHERE f.target_galaxy = tp.galaxy
      AND f.target_system = tp.solar_system
      AND f.target_position = tp.position
      AND f.mission_type = 'deploy'
      AND COALESCE(f.target_type, 'planet') = tp.planet_type
      AND f.is_completed = false
      AND f.is_returning = false
      AND f.user_id <> v_defender_id
      AND f.user_id NOT IN (SELECT ap.user_id FROM acs_participants ap WHERE ap.acs_id = p_acs_id)
      AND f.arrival_time <= now()
  LOOP
    SELECT
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'weapons_tech'), 0),
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'shielding_tech'), 0),
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'armour_tech'), 0)
    INTO v_weapon_bonus, v_shield_bonus, v_hull_bonus;

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

  v_combat_result := simulate_xnova_combat(v_attacker_units, v_defender_units);$r$);

  EXECUTE src;
END $do$;

-- 2) process_acs_fleet_arrival: perdidas de aliados, luna, battle_reports, aviso a aliados
DO $do$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.process_acs_fleet_arrival(uuid)'::regprocedure);
  src := replace(src, E'\r\n', E'\n');  -- normaliza CRLF para que los anchors coincidan
  IF position('[ACSPARITY1]' in src) > 0 THEN
    RAISE NOTICE 'process_acs_fleet_arrival ya parcheado';
    RETURN;
  END IF;

  src := pg_temp._acsp_rep(src, $r$  v_attacker_names text;$r$, $r$  v_attacker_names text;
  v_moon_result jsonb;
  v_def_body text;
  v_share numeric;
  v_c jsonb;$r$);

  -- planet_ships solo se actualiza con las unidades propias del planeta (no con las de aliados)
  src := pg_temp._acsp_rep(src,
    $r$WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;$r$,
    $r$WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer AND COALESCE(v_unit->>'source', 'planet') = 'planet';$r$);

  src := pg_temp._acsp_rep(src,
    $r$  FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->'destroyed_defenses')$r$,
    $r$  -- [ACSPARITY1] Perdidas de flotas aliadas estacionadas (patron [FLOTAS v17]: fila vacia se borra)
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

  FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->'destroyed_defenses')$r$);

  src := pg_temp._acsp_rep(src,
    $r$    UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = v_target_planet.user_id;
  END IF;
$r$,
    $r$    UPDATE profiles SET battles_draw = battles_draw + 1 WHERE id = v_target_planet.user_id;
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
$r$);

  src := pg_temp._acsp_rep(src,
    $r$    'battle'
  );

  UPDATE acs_fleets SET is_active = false, status = 'completed' WHERE id = p_acs_id;$r$,
    $r$    'battle'
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

  UPDATE acs_fleets SET is_active = false, status = 'completed' WHERE id = p_acs_id;$r$);

  EXECUTE src;
END $do$;

-- 3) get_destruction_ranking: ponderar la destruccion del defensor por la cuota ACS
DO $do$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.get_destruction_ranking()'::regprocedure);
  src := replace(src, E'\r\n', E'\n');  -- normaliza CRLF para que los anchors coincidan
  IF position('[ACSPARITY1]' in src) > 0 THEN
    RAISE NOTICE 'get_destruction_ranking ya parcheado';
    RETURN;
  END IF;

  src := pg_temp._acsp_rep(src,
    $r$      -- Calculate attacker fleet loss (defender destroyed these)$r$,
    $r$      -- [ACSPARITY1] En ACS cada participante tiene su fila: se le acredita solo su cuota
      IF report_data ? 'acs_share' THEN
        defender_fleet_loss := FLOOR(defender_fleet_loss * (report_data->>'acs_share')::numeric);
      END IF;

      -- Calculate attacker fleet loss (defender destroyed these)$r$);

  EXECUTE src;
END $do$;
