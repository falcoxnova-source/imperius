/*
  # Fix Alliance Re-Join and Kick Bugs

  1. Bug Fix: Re-Application Blocked by UNIQUE Constraint
    - Problem: `alliance_applications` has UNIQUE(alliance_id, user_id). When a user leaves 
      or is kicked from an alliance and tries to re-apply to the SAME alliance, the INSERT fails 
      because the old accepted/rejected application record still exists.
    - Fix: `leave_alliance` and `kick_alliance_member` now DELETE old application records 
      for that user+alliance combo, so they can re-apply freely.
    - Also updated `accept_alliance_application` to DELETE (not just set status='rejected') 
      old applications from other alliances, preventing future UNIQUE conflicts.

  2. Bug Fix: Alliance Admin Cannot Kick Members of Equal Rank
    - Problem: The kick function checks `target.rank_level >= kicker.rank_level` which blocks 
      kicking members of equal rank. Many alliances promoted multiple admins to the same rank, 
      making it impossible for them to kick each other.
    - Fix: The alliance leader (identified by alliances.leader_id) can now kick ANY member 
      regardless of rank. For non-leaders, the existing strict rank check remains: you can 
      only kick members with a LOWER rank than yours.

  3. Modified Functions
    - `leave_alliance` - Now cleans up old applications for the user in that alliance
    - `kick_alliance_member` - Leader can kick anyone; also cleans up old applications
    - `accept_alliance_application` - Deletes (instead of rejecting) other pending applications

  4. Important Notes
    - No table structure changes
    - No RLS policy changes
    - SECURITY DEFINER functions remain secure with proper auth checks
*/

-- Fix leave_alliance to clean up old applications
CREATE OR REPLACE FUNCTION leave_alliance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_membership record;
  v_member_count int;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT am.*, a.leader_id, a.id as alliance_id, a.name as alliance_name
  INTO v_membership
  FROM alliance_members am
  JOIN alliances a ON am.alliance_id = a.id
  WHERE am.user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No estas en una alianza');
  END IF;
  
  SELECT COUNT(*) INTO v_member_count
  FROM alliance_members
  WHERE alliance_id = v_membership.alliance_id;
  
  IF v_membership.leader_id = v_user_id THEN
    IF v_member_count > 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Debes transferir el liderazgo antes de salir');
    END IF;
  END IF;
  
  DELETE FROM alliance_members WHERE user_id = v_user_id AND alliance_id = v_membership.alliance_id;
  
  DELETE FROM alliance_applications
  WHERE user_id = v_user_id AND alliance_id = v_membership.alliance_id;
  
  IF v_member_count = 1 THEN
    DELETE FROM alliance_applications WHERE alliance_id = v_membership.alliance_id;
    DELETE FROM alliance_diplomacy WHERE alliance_id = v_membership.alliance_id OR target_alliance_id = v_membership.alliance_id;
    DELETE FROM alliances WHERE id = v_membership.alliance_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Alianza disuelta');
  ELSE
    UPDATE alliances
    SET member_count = member_count - 1
    WHERE id = v_membership.alliance_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Has salido de la alianza');
  END IF;
END;
$$;

-- Fix kick_alliance_member: leader can kick anyone + clean up old applications
CREATE OR REPLACE FUNCTION kick_alliance_member(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_membership record;
  v_target_membership record;
  v_alliance record;
  v_is_leader boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT * INTO v_user_membership
  FROM alliance_members
  WHERE user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No estas en una alianza');
  END IF;
  
  IF NOT COALESCE(v_user_membership.can_kick, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para expulsar miembros');
  END IF;
  
  SELECT * INTO v_target_membership
  FROM alliance_members
  WHERE id = p_member_id AND alliance_id = v_user_membership.alliance_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Miembro no encontrado');
  END IF;
  
  IF v_target_membership.user_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes expulsarte a ti mismo');
  END IF;
  
  SELECT * INTO v_alliance
  FROM alliances
  WHERE id = v_user_membership.alliance_id;
  
  v_is_leader := (v_user_id = v_alliance.leader_id);
  
  IF v_target_membership.user_id = v_alliance.leader_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes expulsar al lider');
  END IF;
  
  IF NOT v_is_leader AND v_target_membership.rank_level >= v_user_membership.rank_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes expulsar a alguien de mayor o igual rango');
  END IF;
  
  DELETE FROM alliance_members WHERE id = p_member_id;
  
  DELETE FROM alliance_applications
  WHERE user_id = v_target_membership.user_id AND alliance_id = v_user_membership.alliance_id;
  
  UPDATE alliances
  SET member_count = member_count - 1
  WHERE id = v_user_membership.alliance_id;
  
  INSERT INTO messages (recipient_id, subject, body, message_type)
  VALUES (
    v_target_membership.user_id,
    'Has sido expulsado de ' || v_alliance.name,
    'Has sido expulsado de la alianza [' || v_alliance.tag || '] ' || v_alliance.name || '.',
    'alliance'
  );
  
  RETURN jsonb_build_object('success', true, 'message', 'Miembro expulsado');
END;
$$;

-- Fix accept_alliance_application: DELETE old apps instead of just rejecting
CREATE OR REPLACE FUNCTION accept_alliance_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alliance_id uuid;
  v_applicant_id uuid;
  v_user_id uuid;
  v_membership record;
  v_member_count int;
  v_max_members int := 10;
  v_existing_member boolean;
  v_app_status text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT alliance_id, user_id, status INTO v_alliance_id, v_applicant_id, v_app_status
  FROM alliance_applications
  WHERE id = p_application_id;

  IF v_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada');
  END IF;

  IF v_app_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La solicitud ya fue procesada');
  END IF;

  SELECT * INTO v_membership
  FROM alliance_members
  WHERE alliance_id = v_alliance_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres miembro de esta alianza');
  END IF;

  IF NOT COALESCE(v_membership.can_invite, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para aceptar solicitudes');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM alliance_members WHERE user_id = v_applicant_id
  ) INTO v_existing_member;

  IF v_existing_member THEN
    UPDATE alliance_applications SET status = 'rejected' WHERE id = p_application_id;
    RETURN jsonb_build_object('success', false, 'error', 'El jugador ya pertenece a una alianza');
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM alliance_members WHERE alliance_id = v_alliance_id;

  IF v_member_count >= v_max_members THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
    );
  END IF;

  INSERT INTO alliance_members (alliance_id, user_id)
  VALUES (v_alliance_id, v_applicant_id);

  UPDATE alliance_applications SET status = 'accepted' WHERE id = p_application_id;

  DELETE FROM alliance_applications
  WHERE user_id = v_applicant_id
    AND status = 'pending'
    AND id != p_application_id;

  UPDATE alliances SET member_count = v_member_count + 1 WHERE id = v_alliance_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
