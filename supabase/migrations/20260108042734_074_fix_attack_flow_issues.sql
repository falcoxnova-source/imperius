/*
  # Fix Attack Flow Issues

  ## Summary
  This migration fixes critical issues in the fleet attack validation and combat flow.

  ## Issues Fixed
  1. validate_fleet_mission was calling check_bashing_rule but the function is named check_bashing_limit
  2. check_noob_protection returns 'can_attack' but validate_fleet_mission was checking for 'allowed'
  
  ## Changes
  - Updated validate_fleet_mission to call check_bashing_limit (correct function name)
  - Updated validate_fleet_mission to check 'can_attack' from check_noob_protection
  - Added comprehensive comments explaining the attack flow logic
*/

-- ==============================================================================
-- FIX: validate_fleet_mission function
-- Corrects function call names and JSON key checks
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.validate_fleet_mission(
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_origin_planet RECORD;
  v_target_planet RECORD;
  v_target_user_id uuid;
  v_bashing_check jsonb;
  v_protection_check jsonb;
  v_user_alliance_id uuid;
  v_target_alliance_id uuid;
BEGIN
  -- ===========================================================================
  -- STEP 1: Validate user owns the origin planet
  -- ===========================================================================
  SELECT * INTO v_origin_planet
  FROM planets
  WHERE id = p_origin_planet_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'No tienes acceso a este planeta');
  END IF;

  -- ===========================================================================
  -- STEP 2: Get user's alliance membership (for transport restrictions)
  -- ===========================================================================
  SELECT alliance_id INTO v_user_alliance_id 
  FROM alliance_members 
  WHERE user_id = p_user_id;

  -- ===========================================================================
  -- EXPEDITION MISSION: Must target position 16 (deep space)
  -- ===========================================================================
  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================================================
  -- RECYCLE MISSION: Requires debris field at target coordinates
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

  -- ===========================================================================
  -- STEP 3: Get target planet information
  -- ===========================================================================
  SELECT * INTO v_target_planet
  FROM planets
  WHERE galaxy = p_target_galaxy
  AND solar_system = p_target_system
  AND position = p_target_position;

  -- ===========================================================================
  -- COLONIZE MISSION: Target position must be empty
  -- ===========================================================================
  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Ya existe un planeta en esas coordenadas');
    END IF;
    IF p_target_position < 1 OR p_target_position > 15 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Posicion invalida para colonizar');
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================================================
  -- ATTACK / ESPIONAGE MISSIONS: Combat-related validations
  -- ===========================================================================
  IF p_mission_type IN ('attack', 'espionage') THEN
    -- Target planet must exist
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    -- Cannot attack own planets
    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tu propio planeta');
    END IF;

    -- Check bashing protection (max 6 attacks per 24h to same player)
    -- FIX: Using correct function name check_bashing_limit (not check_bashing_rule)
    IF p_mission_type = 'attack' THEN
      v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;

    -- Check noob protection (point ratio limits)
    -- FIX: Using correct JSON key 'can_attack' (not 'allowed')
    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'can_attack')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================================================
  -- TRANSPORT / DEPLOY MISSIONS
  -- ===========================================================================
  IF p_mission_type IN ('transport', 'deploy') THEN
    -- Target planet must exist
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    -- DEPLOY: Only to own planets (move ships permanently)
    IF p_mission_type = 'deploy' THEN
      IF v_target_planet.user_id != p_user_id THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes desplegar en tus propios planetas');
      END IF;
      RETURN jsonb_build_object('valid', true);
    END IF;

    -- TRANSPORT: Alliance restriction check
    IF p_mission_type = 'transport' THEN
      v_target_user_id := v_target_planet.user_id;

      -- Can always transport to own planets
      IF v_target_user_id = p_user_id THEN
        RETURN jsonb_build_object('valid', true);
      END IF;

      -- Must be in an alliance to send resources to other players
      IF v_user_alliance_id IS NULL THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'Debes estar en una alianza para enviar recursos a otros jugadores. Usa "Desplegar" para tus propios planetas.'
        );
      END IF;

      -- Get target user's alliance
      SELECT alliance_id INTO v_target_alliance_id 
      FROM alliance_members 
      WHERE user_id = v_target_user_id;

      -- Target must be in the same alliance
      IF v_target_alliance_id IS NULL OR v_target_alliance_id != v_user_alliance_id THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'Solo puedes transportar recursos a miembros de tu alianza. El jugador destino no esta en tu alianza.'
        );
      END IF;

      RETURN jsonb_build_object('valid', true);
    END IF;
  END IF;

  -- Default: Allow mission
  RETURN jsonb_build_object('valid', true);
END;
$function$;

-- ==============================================================================
-- ALSO FIX: The 5-parameter version of validate_fleet_mission
-- This version is also used and has the same issues
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.validate_fleet_mission(
  p_user_id uuid, 
  p_mission_type text, 
  p_target_galaxy integer, 
  p_target_system integer, 
  p_target_position integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_target_planet record;
  v_protection_check jsonb;
  v_bashing_check jsonb;
  v_max_colonies integer;
  v_current_colonies integer;
  v_astrophysics_level integer;
BEGIN
  -- Get target planet if exists
  SELECT p.*, pr.id as owner_id INTO v_target_planet
  FROM public.planets p
  LEFT JOIN public.profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
  AND p.solar_system = p_target_system
  AND p.position = p_target_position
  AND p.planet_type = 'planet'
  AND NOT p.is_destroyed;

  -- ===========================================================================
  -- COLONIZE MISSION: Check colony limits based on Astrophysics research
  -- ===========================================================================
  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'La posicion ya esta ocupada');
    END IF;

    SELECT COUNT(*) INTO v_current_colonies
    FROM public.planets WHERE user_id = p_user_id AND NOT is_destroyed;

    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
    FROM public.user_technologies ut
    JOIN public.technology_types tt ON ut.technology_type_id = tt.id
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

    -- FIX: Using correct JSON key 'can_attack' from check_noob_protection
    v_protection_check := public.check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'can_attack')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    -- FIX: Using correct function name check_bashing_limit
    IF p_mission_type = 'attack' THEN
      v_bashing_check := public.check_bashing_limit(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;
  END IF;

  -- ===========================================================================
  -- TRANSPORT / DEPLOY MISSIONS
  -- ===========================================================================
  IF p_mission_type IN ('transport', 'deploy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF p_mission_type = 'deploy' AND v_target_planet.user_id != p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes estacionar en tus propios planetas');
    END IF;
  END IF;

  -- ===========================================================================
  -- RECYCLE MISSION: Check debris field exists
  -- ===========================================================================
  IF p_mission_type = 'recycle' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.debris_fields
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
$function$;
