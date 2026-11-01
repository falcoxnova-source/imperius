/*
  # Fix Accept Alliance Application Function

  ## Problem
  The `accept_alliance_application` function has issues:
  1. If `can_invite` is NULL, the NOT check doesn't work as expected
  2. Need to properly handle case when user is not a member

  ## Solution
  - Use COALESCE to handle NULL values
  - Explicitly check if user is a member first
  - Add better error messages
*/

CREATE OR REPLACE FUNCTION accept_alliance_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_application record;
  v_membership record;
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

  -- Check if user is a member of this alliance and can invite
  SELECT * INTO v_membership
  FROM alliance_members
  WHERE alliance_id = v_application.alliance_id AND user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres miembro de esta alianza');
  END IF;
  
  IF NOT COALESCE(v_membership.can_invite, false) THEN
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

  -- Check if applicant is already in an alliance
  IF EXISTS (SELECT 1 FROM alliance_members WHERE user_id = v_application.user_id) THEN
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
  INSERT INTO alliance_members (alliance_id, user_id, rank_name, rank_level, can_invite, can_kick, can_edit)
  VALUES (v_application.alliance_id, v_application.user_id, 'Miembro', 1, false, false, false);

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
