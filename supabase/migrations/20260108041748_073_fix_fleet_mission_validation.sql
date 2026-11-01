/*
  # Fix Fleet Mission Validation

  1. Changes
    - Fix validate_fleet_mission function to properly look up alliance_id from alliance_members table
    - Add 'fleet_warning' to messages_message_type_check constraint

  2. Issues Fixed
    - Error: "v_user_profile" has no field "alliance_id" - profiles table doesn't have alliance_id
    - Error: messages_message_type_check constraint violation for 'fleet_warning'
*/

-- First, add 'fleet_warning' to the messages check constraint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check 
  CHECK (message_type = ANY (ARRAY['player', 'system', 'battle', 'espionage', 'expedition', 'alliance', 'fleet_warning']));

-- Drop and recreate the validate_fleet_mission function with correct alliance lookup
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

  -- For expedition, target must be position 16
  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- For recycle mission, check debris field exists
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
  AND position = p_target_position;

  -- For colonize, position must be empty
  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Ya existe un planeta en esas coordenadas');
    END IF;
    IF p_target_position < 1 OR p_target_position > 15 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Posicion invalida para colonizar');
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- For attack/espionage, check target exists and protections
  IF p_mission_type IN ('attack', 'espionage') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tu propio planeta');
    END IF;

    -- Check bashing rule for attacks
    IF p_mission_type = 'attack' THEN
      v_bashing_check := check_bashing_rule(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;

    -- Check noob protection
    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'allowed')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================
  -- TRANSPORT & DEPLOY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('transport', 'deploy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    -- Deploy: Only to own planets
    IF p_mission_type = 'deploy' THEN
      IF v_target_planet.user_id != p_user_id THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes desplegar en tus propios planetas');
      END IF;
      RETURN jsonb_build_object('valid', true);
    END IF;

    -- Transport: Check alliance restriction
    IF p_mission_type = 'transport' THEN
      v_target_user_id := v_target_planet.user_id;

      -- Can always transport to own planets
      IF v_target_user_id = p_user_id THEN
        RETURN jsonb_build_object('valid', true);
      END IF;

      -- Check if user is in an alliance
      IF v_user_alliance_id IS NULL THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'Debes estar en una alianza para enviar recursos a otros jugadores. Usa "Desplegar" para tus propios planetas.'
        );
      END IF;

      -- Get target user's alliance from alliance_members table
      SELECT alliance_id INTO v_target_alliance_id 
      FROM alliance_members 
      WHERE user_id = v_target_user_id;

      -- Check if target is in the same alliance
      IF v_target_alliance_id IS NULL OR v_target_alliance_id != v_user_alliance_id THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'Solo puedes transportar recursos a miembros de tu alianza. El jugador destino no esta en tu alianza.'
        );
      END IF;

      -- Both users are in the same alliance
      RETURN jsonb_build_object('valid', true);
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$function$;
