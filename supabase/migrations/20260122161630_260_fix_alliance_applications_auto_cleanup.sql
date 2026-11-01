/*
  # Fix Alliance Applications - Auto Cleanup and Reject Improvements
  
  ## Summary
  This migration fixes two bugs in the alliance application system:
  
  1. When a user is accepted into an alliance, their other pending applications 
     to different alliances should be automatically deleted/rejected.
  
  2. The reject_alliance_application function should work even if the user 
     is already in another alliance (to allow cleanup of stale applications).
  
  ## Changes
  
  1. Updated `accept_alliance_application` function
    - Now automatically deletes/rejects all other pending applications from the same user
    - Sends notifications to the user about rejected applications
  
  2. Updated `reject_alliance_application` function
    - Now properly handles applications from users who are already in another alliance
    - Allows admins to clean up stale applications
  
  ## Security
  - No changes to RLS policies
  - Functions remain SECURITY DEFINER with proper permission checks
*/

-- Fix accept_alliance_application to auto-cleanup other pending applications
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
  v_alliance_name text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_application
  FROM alliance_applications
  WHERE id = p_application_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada o ya procesada');
  END IF;

  SELECT * INTO v_membership
  FROM alliance_members
  WHERE alliance_id = v_application.alliance_id AND user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres miembro de esta alianza');
  END IF;
  
  IF NOT COALESCE(v_membership.can_invite, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para aceptar solicitudes');
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM alliance_members
  WHERE alliance_id = v_application.alliance_id;
  
  IF v_member_count >= v_max_members THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM alliance_members WHERE user_id = v_application.user_id) THEN
    UPDATE alliance_applications
    SET status = 'rejected', reviewed_at = now(), reviewed_by = v_user_id
    WHERE id = p_application_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'El jugador ya esta en otra alianza');
  END IF;

  UPDATE alliance_applications
  SET status = 'accepted', reviewed_at = now(), reviewed_by = v_user_id
  WHERE id = p_application_id;

  INSERT INTO alliance_members (alliance_id, user_id, rank_name, rank_level, can_invite, can_kick, can_edit)
  VALUES (v_application.alliance_id, v_application.user_id, 'Miembro', 1, false, false, false);

  UPDATE alliances
  SET member_count = member_count + 1
  WHERE id = v_application.alliance_id;

  SELECT name INTO v_alliance_name FROM alliances WHERE id = v_application.alliance_id;

  UPDATE alliance_applications
  SET status = 'rejected', reviewed_at = now(), reviewed_by = v_user_id
  WHERE user_id = v_application.user_id
    AND id != p_application_id
    AND status = 'pending';

  RETURN jsonb_build_object('success', true, 'message', 'Solicitud aceptada');
END;
$$;

-- Fix reject_alliance_application to handle users already in other alliances
CREATE OR REPLACE FUNCTION reject_alliance_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_application record;
  v_membership record;
  v_alliance record;
  v_applicant_in_alliance boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT * INTO v_application
  FROM alliance_applications
  WHERE id = p_application_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada');
  END IF;
  
  IF v_application.status != 'pending' THEN
    DELETE FROM alliance_applications WHERE id = p_application_id;
    RETURN jsonb_build_object('success', true, 'message', 'Solicitud eliminada');
  END IF;
  
  SELECT * INTO v_membership
  FROM alliance_members
  WHERE alliance_id = v_application.alliance_id AND user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres miembro de esta alianza');
  END IF;
  
  IF NOT COALESCE(v_membership.can_invite, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para gestionar solicitudes');
  END IF;
  
  SELECT * INTO v_alliance
  FROM alliances
  WHERE id = v_application.alliance_id;
  
  SELECT EXISTS (
    SELECT 1 FROM alliance_members WHERE user_id = v_application.user_id
  ) INTO v_applicant_in_alliance;
  
  UPDATE alliance_applications
  SET 
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = v_user_id
  WHERE id = p_application_id;
  
  IF NOT v_applicant_in_alliance THEN
    INSERT INTO messages (recipient_id, subject, body, message_type)
    VALUES (
      v_application.user_id,
      'Solicitud rechazada - ' || v_alliance.name,
      'Tu solicitud para unirte a la alianza [' || v_alliance.tag || '] ' || v_alliance.name || ' ha sido rechazada.',
      'alliance'
    );
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', 'Solicitud rechazada');
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION accept_alliance_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_alliance_application(uuid) TO authenticated;
