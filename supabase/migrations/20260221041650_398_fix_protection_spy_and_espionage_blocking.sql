/*
  # Fix Protection System - Allow Espionage Through Protection

  1. Changes
    - `check_protection_status`: Fix `can_spy` to always be true for enemy planets
      (espionage should NEVER be blocked by noob protection, matching XNova/OGame behavior)
    - `validate_fleet_mission`: Skip noob protection check for espionage missions
      (only attacks should be blocked by noob protection)

  2. Bug Description
    - Previously, `can_spy` was set to the same value as `can_attack`, blocking
      espionage on protected players
    - `validate_fleet_mission` ran `check_noob_protection` for both attack AND
      espionage missions, incorrectly blocking spy probes on protected players
    - In XNova/OGame, espionage is ALWAYS allowed regardless of protection status

  3. Security
    - No RLS changes
    - Attack protection remains enforced
    - Only espionage is unblocked through protection
*/

CREATE OR REPLACE FUNCTION check_protection_status(
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_target_planet record;
  v_protection_check jsonb;
  v_bashing_check jsonb;
  v_attacker_points integer;
  v_defender_points integer;
  v_protection_ratio integer;
  v_noob_limit integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT p.*, pr.username as owner_username, pr.points_total as owner_points
  INTO v_target_planet
  FROM planets p
  JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND NOT p.is_destroyed;

  IF v_target_planet IS NULL THEN
    RETURN jsonb_build_object(
      'has_planet', false,
      'can_attack', true,
      'can_spy', true
    );
  END IF;

  IF v_target_planet.user_id = v_user_id THEN
    RETURN jsonb_build_object(
      'has_planet', true,
      'is_own', true,
      'can_attack', false,
      'can_spy', false,
      'reason', 'Tu propio planeta'
    );
  END IF;

  SELECT points_total INTO v_attacker_points FROM profiles WHERE id = v_user_id;
  v_attacker_points := COALESCE(v_attacker_points, 0);

  SELECT value::integer INTO v_protection_ratio FROM game_settings WHERE key = 'protection_ratio';
  v_protection_ratio := COALESCE(v_protection_ratio, 5);

  SELECT value::integer INTO v_noob_limit FROM game_settings WHERE key = 'newbie_protection_points';
  v_noob_limit := COALESCE(v_noob_limit, 5000);

  v_protection_check := check_noob_protection(v_user_id, v_target_planet.user_id);
  v_bashing_check := check_bashing_rule(v_user_id, v_target_planet.user_id);

  RETURN jsonb_build_object(
    'has_planet', true,
    'is_own', false,
    'owner_username', v_target_planet.owner_username,
    'owner_points', v_target_planet.owner_points,
    'attacker_points', v_attacker_points,
    'protection_ratio', v_protection_ratio,
    'noob_limit', v_noob_limit,
    'can_attack', COALESCE((v_protection_check->>'can_attack')::boolean, false)
      AND COALESCE((v_bashing_check->>'allowed')::boolean, true),
    'can_spy', true,
    'protection_reason', v_protection_check->>'reason',
    'bashing_reason', v_bashing_check->>'reason'
  );
END;
$$;

CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin_planet RECORD;
  v_target_planet RECORD;
  v_target_user_id uuid;
  v_bashing_check jsonb;
  v_protection_check jsonb;
  v_user_alliance_id uuid;
  v_target_alliance_id uuid;
  v_attacker_vacation boolean;
  v_target_vacation boolean;
  v_hostile_missions text[] := ARRAY['attack', 'espionage', 'destroy'];
  v_max_colonies integer;
  v_current_colonies integer;
  v_astrophysics_level integer;
  v_max_expeditions integer;
  v_active_expeditions integer;
BEGIN

  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;

  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
    );
  END IF;

  SELECT * INTO v_origin_planet
  FROM planets
  WHERE id = p_origin_planet_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'No tienes acceso a este planeta');
  END IF;

  SELECT alliance_id INTO v_user_alliance_id
  FROM alliance_members
  WHERE user_id = p_user_id;

  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;

    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

    v_astrophysics_level := COALESCE(v_astrophysics_level, 0);
    v_max_expeditions := FLOOR(SQRT(v_astrophysics_level::numeric));

    IF v_max_expeditions < 1 AND v_astrophysics_level >= 1 THEN
      v_max_expeditions := 1;
    END IF;

    IF v_max_expeditions < 1 THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'Necesitas investigar Astrofisica para enviar expediciones'
      );
    END IF;

    SELECT COUNT(*) INTO v_active_expeditions
    FROM fleets
    WHERE user_id = p_user_id
      AND mission_type = 'expedition'
      AND is_completed = false;

    IF v_active_expeditions >= v_max_expeditions THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', format('Has alcanzado el maximo de expediciones simultaneas (%s). Investiga Astrofisica para desbloquear mas.', v_max_expeditions)
      );
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  IF p_mission_type = 'recycle' THEN
    IF NOT EXISTS (
      SELECT 1 FROM debris_fields
      WHERE galaxy = p_target_galaxy
        AND solar_system = p_target_system
        AND position = p_target_position
        AND (metal > 0 OR crystal > 0)
    ) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay campo de escombros en esas coordenadas');
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  SELECT * INTO v_target_planet
  FROM planets
  WHERE galaxy = p_target_galaxy
    AND solar_system = p_target_system
    AND position = p_target_position
    AND NOT is_destroyed;

  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Ya existe un planeta en esas coordenadas');
    END IF;
    IF p_target_position < 1 OR p_target_position > 15 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Posicion invalida para colonizar');
    END IF;

    SELECT COUNT(*) INTO v_current_colonies
    FROM planets WHERE user_id = p_user_id AND NOT is_destroyed;

    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

    v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

    IF v_current_colonies >= v_max_colonies THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica.', v_max_colonies)
      );
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  IF v_target_planet IS NOT NULL AND p_mission_type = ANY(v_hostile_missions) THEN
    SELECT vacation_mode INTO v_target_vacation
    FROM profiles WHERE id = v_target_planet.user_id;

    IF COALESCE(v_target_vacation, false) THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'No puedes atacar a jugadores en modo vacaciones'
      );
    END IF;
  END IF;

  IF p_mission_type = 'attack' THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tu propio planeta');
    END IF;

    v_bashing_check := check_bashing_rule(p_user_id, v_target_planet.user_id);
    IF NOT (v_bashing_check->>'allowed')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
    END IF;

    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT COALESCE((v_protection_check->>'can_attack')::boolean, false) THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  IF p_mission_type = 'espionage' THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes espiar tu propio planeta');
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  IF p_mission_type = 'deploy' THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id != p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes desplegar en tus propios planetas');
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  IF p_mission_type = 'transport' THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    v_target_user_id := v_target_planet.user_id;

    IF v_target_user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', true);
    END IF;

    IF v_user_alliance_id IS NULL THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'Debes estar en una alianza para enviar recursos a otros jugadores. Usa "Desplegar" para tus propios planetas.'
      );
    END IF;

    SELECT alliance_id INTO v_target_alliance_id
    FROM alliance_members
    WHERE user_id = v_target_user_id;

    IF v_target_alliance_id IS NULL THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'El jugador destino no pertenece a ninguna alianza. Solo puedes transportar a miembros de tu alianza.'
      );
    END IF;

    IF v_target_alliance_id != v_user_alliance_id THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'Solo puedes transportar recursos a miembros de tu alianza. El jugador destino no esta en tu alianza.'
      );
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;
