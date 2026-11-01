/*
  # Fix Transport Alliance Restriction

  1. Changes
    - Completely rewrites validate_fleet_mission to include transport alliance restriction
    - Transport missions only allowed to:
      - Your own planets (always allowed)
      - Players in your same alliance (both must have alliance)
    - Blocks transport to players without common alliance (anti-multiaccounting)

  2. Security
    - Prevents abuse from multi-accounts transferring resources
*/

-- Drop and recreate to ensure clean function
DROP FUNCTION IF EXISTS validate_fleet_mission(uuid, text, integer, integer, integer);

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
  -- ===========================================================================
  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;

  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
    );
  END IF;

  -- Get target planet with owner's alliance info
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
  -- COLONIZE MISSION
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
  -- EXPEDITION MISSION
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

    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'can_attack')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    IF p_mission_type = 'attack' THEN
      v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;
  END IF;

  -- ===========================================================================
  -- TRANSPORT MISSION - ALLIANCE RESTRICTION (ANTI-MULTIACCOUNTING)
  -- Only allows transport to:
  -- 1. Your own planets (always allowed)
  -- 2. Alliance members (both must be in the same alliance)
  -- ===========================================================================
  IF p_mission_type = 'transport' THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    -- Always allow transport to your own planets
    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', true);
    END IF;

    -- Get sender's alliance
    SELECT alliance_id INTO v_sender_alliance_id
    FROM profiles WHERE id = p_user_id;

    -- Get target's alliance (already in v_target_planet)
    v_target_alliance_id := v_target_planet.target_alliance_id;

    -- Sender must have an alliance to transport to other players
    IF v_sender_alliance_id IS NULL THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', 'Debes pertenecer a una alianza para transportar recursos a otros jugadores'
      );
    END IF;

    -- Target must have an alliance
    IF v_target_alliance_id IS NULL THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', 'El jugador destino debe pertenecer a una alianza para recibir transportes'
      );
    END IF;

    -- Both must be in the SAME alliance
    IF v_sender_alliance_id != v_target_alliance_id THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', 'Solo puedes transportar recursos a miembros de tu misma alianza'
      );
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================================================
  -- DEPLOY MISSION
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
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;