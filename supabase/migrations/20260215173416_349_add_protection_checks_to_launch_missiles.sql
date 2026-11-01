/*
  # Add missing protection checks to launch_missiles function

  1. Changes
    - Adds attacker vacation mode check (attacker cannot launch missiles while in vacation)
    - Adds noob protection check via check_noob_protection() (prevents attacking protected players)
    - Adds bashing limit check via check_bashing_limit() (max 6 attacks per 24h to same player)
    - Logs missile attacks in attack_log table for bashing tracking

  2. Security
    - Missiles now respect the same protection rules as fleet attacks
    - Prevents abuse of missiles to bypass newbie protection
*/

CREATE OR REPLACE FUNCTION launch_missiles(
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_missile_count integer,
  p_primary_target text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin_planet record;
  v_target_planet record;
  v_target_owner record;
  v_attacker_id uuid;
  v_attacker_profile record;
  v_available_missiles integer;
  v_abm_count integer;
  v_effective_missiles integer;
  v_silo_level integer;
  v_impulse_level integer;
  v_max_range integer;
  v_actual_distance integer;
  v_destroyed_defenses jsonb := '[]'::jsonb;
  v_defense_record record;
  v_remaining_damage integer;
  v_defense_destroyed integer;
  v_ipm_damage_per_missile CONSTANT integer := 12000;
  v_protection_check jsonb;
  v_bashing_check jsonb;
BEGIN
  SELECT p.*, p.user_id as owner_id
  INTO v_origin_planet
  FROM planets p
  WHERE p.id = p_origin_planet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta de origen no encontrado');
  END IF;

  v_attacker_id := v_origin_planet.owner_id;

  SELECT * INTO v_attacker_profile FROM profiles WHERE id = v_attacker_id;

  IF COALESCE(v_attacker_profile.vacation_mode, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes lanzar misiles en modo vacaciones');
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_silo_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_origin_planet_id AND bt.code = 'missile_silo';

  v_silo_level := COALESCE(v_silo_level, 0);

  IF v_silo_level < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas Silo de Misiles nivel 4 para lanzar misiles interplanetarios');
  END IF;

  SELECT COALESCE(ut.level, 0) INTO v_impulse_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = v_attacker_id AND tt.code = 'impulse_drive';

  v_impulse_level := COALESCE(v_impulse_level, 0);

  IF v_impulse_level < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas Motor de Impulso nivel 1 para lanzar misiles');
  END IF;

  v_max_range := (v_impulse_level * 5) - 1;

  SELECT COALESCE(pd.quantity, 0) INTO v_available_missiles
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = p_origin_planet_id AND dt.code = 'interplanetary_missile';

  v_available_missiles := COALESCE(v_available_missiles, 0);

  IF v_available_missiles < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes misiles interplanetarios');
  END IF;

  IF v_available_missiles < p_missile_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Solo tienes %s misiles interplanetarios disponibles', v_available_missiles)
    );
  END IF;

  IF v_origin_planet.galaxy != p_target_galaxy THEN
    RETURN jsonb_build_object('success', false, 'error', 'Los misiles solo pueden alcanzar objetivos en la misma galaxia');
  END IF;

  v_actual_distance := ABS(v_origin_planet.solar_system - p_target_system);

  IF v_actual_distance > v_max_range THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Objetivo fuera de alcance. Motor de Impulso nivel %s permite %s sistemas. Distancia: %s sistemas.', 
        v_impulse_level, v_max_range, v_actual_distance)
    );
  END IF;

  SELECT p.* INTO v_target_planet
  FROM planets p
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = 'planet';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay planeta en esas coordenadas');
  END IF;

  IF v_target_planet.user_id = v_attacker_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes atacar tus propios planetas');
  END IF;

  IF v_target_planet.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El planeta objetivo no esta colonizado');
  END IF;

  SELECT * INTO v_target_owner FROM profiles WHERE id = v_target_planet.user_id;
  IF v_target_owner.vacation_mode = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'El jugador objetivo esta en modo vacaciones');
  END IF;

  v_protection_check := check_noob_protection(v_attacker_id, v_target_planet.user_id);
  IF NOT (v_protection_check->>'can_attack')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_protection_check->>'reason');
  END IF;

  v_bashing_check := check_bashing_limit(v_attacker_id, v_target_planet.user_id);
  IF NOT (v_bashing_check->>'allowed')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_bashing_check->>'reason');
  END IF;

  SELECT COALESCE(pd.quantity, 0) INTO v_abm_count
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = v_target_planet.id AND dt.code = 'anti_ballistic_missile';

  v_abm_count := COALESCE(v_abm_count, 0);

  v_effective_missiles := GREATEST(0, p_missile_count - v_abm_count);

  UPDATE planet_defenses pd
  SET quantity = quantity - p_missile_count
  FROM defense_types dt
  WHERE pd.defense_type_id = dt.id 
    AND pd.planet_id = p_origin_planet_id 
    AND dt.code = 'interplanetary_missile';

  IF v_abm_count > 0 THEN
    UPDATE planet_defenses pd
    SET quantity = GREATEST(0, quantity - LEAST(p_missile_count, v_abm_count))
    FROM defense_types dt
    WHERE pd.defense_type_id = dt.id 
      AND pd.planet_id = v_target_planet.id 
      AND dt.code = 'anti_ballistic_missile';
  END IF;

  INSERT INTO attack_log (attacker_id, defender_id, target_planet_id)
  VALUES (v_attacker_id, v_target_planet.user_id, v_target_planet.id);

  IF v_effective_missiles > 0 THEN
    v_remaining_damage := v_effective_missiles * v_ipm_damage_per_missile;

    FOR v_defense_record IN 
      SELECT pd.id, pd.quantity, dt.structural_integrity, dt.name, dt.code
      FROM planet_defenses pd
      JOIN defense_types dt ON pd.defense_type_id = dt.id
      WHERE pd.planet_id = v_target_planet.id 
        AND pd.quantity > 0
        AND dt.code NOT IN ('anti_ballistic_missile', 'interplanetary_missile')
      ORDER BY 
        CASE WHEN dt.code = p_primary_target THEN 0 ELSE 1 END,
        dt.structural_integrity ASC
    LOOP
      IF v_remaining_damage <= 0 THEN 
        EXIT; 
      END IF;

      v_defense_destroyed := LEAST(
        v_defense_record.quantity,
        FLOOR(v_remaining_damage::numeric / GREATEST(1, v_defense_record.structural_integrity))::integer
      );

      IF v_defense_destroyed > 0 THEN
        v_remaining_damage := v_remaining_damage - (v_defense_destroyed * v_defense_record.structural_integrity);

        UPDATE planet_defenses 
        SET quantity = quantity - v_defense_destroyed 
        WHERE id = v_defense_record.id;

        v_destroyed_defenses := v_destroyed_defenses || jsonb_build_object(
          'name', v_defense_record.name,
          'code', v_defense_record.code,
          'quantity', v_defense_destroyed
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'missiles_launched', p_missile_count,
    'missiles_intercepted', LEAST(v_abm_count, p_missile_count),
    'missiles_effective', v_effective_missiles,
    'total_damage', v_effective_missiles * v_ipm_damage_per_missile,
    'destroyed_defenses', v_destroyed_defenses,
    'impulse_level', v_impulse_level,
    'max_range', v_max_range
  );
END;
$$;