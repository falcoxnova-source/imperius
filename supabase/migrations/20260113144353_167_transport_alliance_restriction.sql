/*
  # Restriccion de transporte por alianza

  1. Cambios
    - Modifica validate_fleet_mission para restringir transportes
    - Solo permite transportar a:
      - Tus propios planetas (siempre permitido)
      - Jugadores de tu misma alianza (si ambos tienen alianza)
    - Bloquea transportes a jugadores sin alianza comun (anti-multicuenta)

  2. Seguridad
    - Previene abuso de multicuentas transportando recursos
*/

CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_mission_type text,
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
  v_target_planet record;
  v_protection_check jsonb;
  v_bashing_check jsonb;
  v_vacation_check jsonb;
  v_max_colonies integer;
  v_current_colonies integer;
  v_astrophysics_level integer;
  v_attacker_vacation boolean;
  v_hostile_missions text[] := ARRAY['attack', 'espionage', 'destroy'];
  v_sender_alliance_id uuid;
  v_target_alliance_id uuid;
BEGIN
  -- ===========================================================================
  -- VACATION MODE CHECK FOR ATTACKER
  -- Jugadores en modo vacaciones no pueden enviar misiones hostiles
  -- ===========================================================================
  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;

  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
    );
  END IF;

  -- Get target planet if exists
  SELECT p.*, pr.id as owner_id, pr.vacation_mode as target_vacation_mode, pr.alliance_id as target_alliance_id
  INTO v_target_planet
  FROM planets p
  LEFT JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = 'planet'
    AND NOT p.is_destroyed;

  -- ===========================================================================
  -- VACATION MODE CHECK FOR DEFENDER
  -- Jugadores en modo vacaciones no pueden ser atacados
  -- ===========================================================================
  IF v_target_planet IS NOT NULL 
     AND v_target_planet.target_vacation_mode = true 
     AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes atacar a jugadores en modo vacaciones'
    );
  END IF;

  -- ===========================================================================
  -- COLONIZE MISSION: Check colony limits based on Astrophysics research
  -- ===========================================================================
  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'La posicion ya esta ocupada');
    END IF;

    SELECT COUNT(*) INTO v_current_colonies
    FROM planets WHERE user_id = p_user_id AND NOT is_destroyed;

    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

    -- Colony formula: 1 + floor((astrophysics + 1) / 2)
    v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

    IF v_current_colonies >= v_max_colonies THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica.', v_max_colonies)
      );
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================================================
  -- EXPEDITION MISSION: Must target position 16
  -- ===========================================================================
  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================================================
  -- ATTACK / ESPIONAGE / DESTROY MISSIONS
  -- ===========================================================================
  IF p_mission_type IN ('attack', 'espionage', 'destroy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tus propios planetas');
    END IF;

    -- Check noob protection
    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'can_attack')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    -- Check bashing limit for attacks
    IF p_mission_type = 'attack' THEN
      v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;
  END IF;

  -- ===========================================================================
  -- TRANSPORT MISSION - RESTRICCION POR ALIANZA
  -- Solo permite transportar a:
  -- 1. Tus propios planetas (siempre permitido)
  -- 2. Miembros de tu misma alianza
  -- ===========================================================================
  IF p_mission_type = 'transport' THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    -- Siempre permitido a tus propios planetas
    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', true);
    END IF;

    -- Obtener alianza del remitente
    SELECT alliance_id INTO v_sender_alliance_id
    FROM profiles WHERE id = p_user_id;

    -- Obtener alianza del destinatario
    v_target_alliance_id := v_target_planet.target_alliance_id;

    -- Si el remitente no tiene alianza, no puede transportar a otros
    IF v_sender_alliance_id IS NULL THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', 'Debes pertenecer a una alianza para transportar recursos a otros jugadores'
      );
    END IF;

    -- Si el destinatario no tiene alianza, no se puede transportar
    IF v_target_alliance_id IS NULL THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', 'El jugador destino debe pertenecer a una alianza para recibir transportes'
      );
    END IF;

    -- Ambos deben estar en la misma alianza
    IF v_sender_alliance_id != v_target_alliance_id THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', 'Solo puedes transportar recursos a miembros de tu misma alianza'
      );
    END IF;
  END IF;

  -- ===========================================================================
  -- DEPLOY MISSIONS
  -- ===========================================================================
  IF p_mission_type = 'deploy' THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id != p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes estacionar en tus propios planetas');
    END IF;
  END IF;

  -- ===========================================================================
  -- RECYCLE MISSION: Check debris field exists
  -- ===========================================================================
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
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;