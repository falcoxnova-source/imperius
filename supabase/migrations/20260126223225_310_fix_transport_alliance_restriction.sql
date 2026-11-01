/*
  # Corregir restriccion de transporte por alianza
  
  ## Problema
  La funcion validate_fleet_mission usaba profiles.alliance_id que no existe.
  La alianza de un usuario se obtiene de la tabla alliance_members.
  
  ## Solucion
  Actualizar validate_fleet_mission para:
  1. Usar alliance_members para obtener la alianza del usuario
  2. Permitir transporte solo a:
     - Propios planetas (siempre permitido)
     - Miembros de la misma alianza
*/

-- Eliminar todas las versiones existentes para evitar ambiguedad
DROP FUNCTION IF EXISTS validate_fleet_mission(uuid, integer, integer, integer, text);
DROP FUNCTION IF EXISTS validate_fleet_mission(uuid, text, integer, integer, integer);
DROP FUNCTION IF EXISTS validate_fleet_mission(uuid, uuid, integer, integer, integer, text);

-- Crear funcion unificada con la restriccion de transporte correcta
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
  v_expedition_result jsonb;
  v_attacker_vacation boolean;
  v_target_vacation boolean;
  v_hostile_missions text[] := ARRAY['attack', 'espionage', 'destroy'];
  v_max_colonies integer;
  v_current_colonies integer;
  v_astrophysics_level integer;
BEGIN
  -- ===========================================================================
  -- VACATION MODE CHECK FOR ATTACKER
  -- ===========================================================================
  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;

  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
    );
  END IF;

  -- Validate user owns the origin planet
  SELECT * INTO v_origin_planet
  FROM planets
  WHERE id = p_origin_planet_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'No tienes acceso a este planeta');
  END IF;

  -- Get user's alliance from alliance_members table
  SELECT alliance_id INTO v_user_alliance_id 
  FROM alliance_members 
  WHERE user_id = p_user_id;

  -- ===========================================================================
  -- EXPEDITION MISSION
  -- ===========================================================================
  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;

    v_expedition_result := charge_expedition_fee(p_user_id);

    IF NOT (v_expedition_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', v_expedition_result->>'error',
        'expedition_fee_required', (v_expedition_result->>'required_fee')::numeric,
        'current_fxu', (v_expedition_result->>'current_balance')::numeric
      );
    END IF;

    RETURN jsonb_build_object(
      'valid', true,
      'expedition_charged', (v_expedition_result->>'charged')::boolean,
      'expedition_fee', (v_expedition_result->>'fee')::numeric,
      'expedition_number', (v_expedition_result->>'expedition_number')::integer
    );
  END IF;

  -- ===========================================================================
  -- RECYCLE MISSION
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
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- Get target planet
  SELECT * INTO v_target_planet
  FROM planets
  WHERE galaxy = p_target_galaxy
    AND solar_system = p_target_system
    AND position = p_target_position
    AND NOT is_destroyed;

  -- ===========================================================================
  -- COLONIZE MISSION
  -- ===========================================================================
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

  -- Check vacation mode for defender (for hostile missions)
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

  -- ===========================================================================
  -- ATTACK / ESPIONAGE MISSIONS
  -- ===========================================================================
  IF p_mission_type IN ('attack', 'espionage') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tu propio planeta');
    END IF;

    IF p_mission_type = 'attack' THEN
      v_bashing_check := check_bashing_rule(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;

    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'allowed')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================================================
  -- DEPLOY MISSION - Solo a propios planetas
  -- ===========================================================================
  IF p_mission_type = 'deploy' THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id != p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes desplegar en tus propios planetas');
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================================================
  -- TRANSPORT MISSION - RESTRICCION DE ALIANZA
  -- Solo permite transporte a:
  -- 1. Tus propios planetas (siempre permitido)
  -- 2. Miembros de la misma alianza
  -- ===========================================================================
  IF p_mission_type = 'transport' THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    v_target_user_id := v_target_planet.user_id;

    -- Siempre permitir transporte a tus propios planetas
    IF v_target_user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', true);
    END IF;

    -- Para transportar a otros jugadores, debes estar en una alianza
    IF v_user_alliance_id IS NULL THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', 'Debes estar en una alianza para enviar recursos a otros jugadores. Usa "Desplegar" para tus propios planetas.'
      );
    END IF;

    -- Obtener alianza del jugador destino
    SELECT alliance_id INTO v_target_alliance_id 
    FROM alliance_members 
    WHERE user_id = v_target_user_id;

    -- El destino debe estar en la misma alianza
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

    -- Ambos usuarios estan en la misma alianza
    RETURN jsonb_build_object('valid', true);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

GRANT EXECUTE ON FUNCTION validate_fleet_mission(uuid, uuid, integer, integer, integer, text) TO authenticated;
