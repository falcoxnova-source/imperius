/*
  # Alliance Limit & Transport Restriction

  ## Overview
  Two major game balance changes:
  1. Alliances limited to maximum 5 members
  2. Resource transport only allowed between alliance members

  ## Changes

  ### 1. Alliance Member Limit
  - Maximum 5 members per alliance
  - Enforced when accepting applications or joining open alliances
  - Existing alliances with more than 5 members are grandfathered

  ### 2. Transport Restriction
  - Transport mission only available to players in the same alliance
  - Players without an alliance cannot send resources to other players
  - Players can still transport to their own planets (deploy mission)
  - This prevents abuse and encourages alliance gameplay

  ## Security
  - Server-side validation prevents bypassing restrictions
  - Clear error messages for users
*/

-- ============================================================
-- PART 1: ALLIANCE MEMBER LIMIT (MAX 5)
-- ============================================================

-- Function to check if alliance can accept more members
CREATE OR REPLACE FUNCTION can_alliance_accept_member(p_alliance_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_count int;
  v_max_members int := 5;
BEGIN
  SELECT COUNT(*) INTO v_member_count
  FROM alliance_members
  WHERE alliance_id = p_alliance_id;
  
  RETURN v_member_count < v_max_members;
END;
$$;

-- Function to accept alliance application with member limit check
CREATE OR REPLACE FUNCTION accept_alliance_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_application record;
  v_can_invite boolean;
  v_member_count int;
  v_max_members int := 5;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Get application
  SELECT * INTO v_application
  FROM alliance_applications
  WHERE id = p_application_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada o ya procesada');
  END IF;

  -- Check if user can invite
  SELECT can_invite INTO v_can_invite
  FROM alliance_members
  WHERE alliance_id = v_application.alliance_id AND user_id = v_user_id;
  
  IF NOT v_can_invite THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para aceptar solicitudes');
  END IF;

  -- Check member limit
  SELECT COUNT(*) INTO v_member_count
  FROM alliance_members
  WHERE alliance_id = v_application.alliance_id;
  
  IF v_member_count >= v_max_members THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
    );
  END IF;

  -- Check if user is already in an alliance
  IF EXISTS (SELECT 1 FROM alliance_members WHERE user_id = v_application.user_id) THEN
    -- Update application status
    UPDATE alliance_applications
    SET status = 'rejected', reviewed_at = now(), reviewed_by = v_user_id
    WHERE id = p_application_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'El jugador ya esta en otra alianza');
  END IF;

  -- Accept the application
  UPDATE alliance_applications
  SET status = 'accepted', reviewed_at = now(), reviewed_by = v_user_id
  WHERE id = p_application_id;

  -- Add member to alliance
  INSERT INTO alliance_members (alliance_id, user_id, rank_name, rank_level, can_invite, can_kick)
  VALUES (v_application.alliance_id, v_application.user_id, 'Miembro', 1, false, false);

  -- Update alliance member count
  UPDATE alliances
  SET member_count = member_count + 1
  WHERE id = v_application.alliance_id;

  -- Update user's alliance_id in profile
  UPDATE profiles
  SET alliance_id = v_application.alliance_id
  WHERE id = v_application.user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Solicitud aceptada');
END;
$$;

-- Function to join open alliance with member limit check
CREATE OR REPLACE FUNCTION join_open_alliance(p_alliance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_alliance record;
  v_member_count int;
  v_max_members int := 5;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Check if already in alliance
  IF EXISTS (SELECT 1 FROM alliance_members WHERE user_id = v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya estas en una alianza');
  END IF;

  -- Get alliance
  SELECT * INTO v_alliance
  FROM alliances
  WHERE id = p_alliance_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alianza no encontrada');
  END IF;

  IF NOT v_alliance.is_open THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta alianza no acepta miembros directamente');
  END IF;

  -- Check member limit
  SELECT COUNT(*) INTO v_member_count
  FROM alliance_members
  WHERE alliance_id = p_alliance_id;
  
  IF v_member_count >= v_max_members THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
    );
  END IF;

  -- Join alliance
  INSERT INTO alliance_members (alliance_id, user_id, rank_name, rank_level, can_invite, can_kick)
  VALUES (p_alliance_id, v_user_id, 'Miembro', 1, false, false);

  -- Update alliance member count
  UPDATE alliances
  SET member_count = member_count + 1
  WHERE id = p_alliance_id;

  -- Update user's alliance_id in profile
  UPDATE profiles
  SET alliance_id = p_alliance_id
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Te has unido a la alianza');
END;
$$;

GRANT EXECUTE ON FUNCTION can_alliance_accept_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_alliance_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION join_open_alliance(uuid) TO authenticated;


-- ============================================================
-- PART 2: TRANSPORT RESTRICTION (ALLIANCE MEMBERS ONLY)
-- ============================================================

-- Update validate_fleet_mission to enforce alliance transport restriction
CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text
)
RETURNS jsonb AS $$
DECLARE
  v_origin_planet RECORD;
  v_target_planet RECORD;
  v_target_user_id uuid;
  v_user_profile RECORD;
  v_target_profile RECORD;
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

  -- Get user profile and alliance
  SELECT * INTO v_user_profile FROM profiles WHERE id = p_user_id;
  v_user_alliance_id := v_user_profile.alliance_id;

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

      -- Get target user's alliance
      SELECT alliance_id INTO v_target_alliance_id FROM profiles WHERE id = v_target_user_id;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION validate_fleet_mission(uuid, uuid, integer, integer, integer, text) TO authenticated;

-- ============================================================
-- HELPER FUNCTION: Get alliance member count
-- ============================================================
CREATE OR REPLACE FUNCTION get_alliance_member_count(p_alliance_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM alliance_members WHERE alliance_id = p_alliance_id;
$$;

GRANT EXECUTE ON FUNCTION get_alliance_member_count(uuid) TO authenticated;
