/*
  # Secure Alliance Operations
  
  1. New Functions
    - `leave_alliance()` - Secure function for leaving an alliance
    - `kick_alliance_member(p_member_id)` - Secure function for kicking members
    - `transfer_alliance_leadership(p_new_leader_id)` - Secure function for leadership transfer
    - `reject_alliance_application(p_application_id)` - Secure function for rejecting applications
  
  2. Security
    - All functions validate user permissions
    - Proper checks for leadership transfer
    - Auto-dissolve alliance if last member leaves
*/

-- Function to leave alliance
CREATE OR REPLACE FUNCTION leave_alliance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_membership record;
  v_alliance record;
  v_member_count int;
  v_next_leader_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Get user's membership
  SELECT am.*, a.leader_id, a.id as alliance_id, a.name as alliance_name
  INTO v_membership
  FROM alliance_members am
  JOIN alliances a ON am.alliance_id = a.id
  WHERE am.user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No estas en una alianza');
  END IF;
  
  -- Count current members
  SELECT COUNT(*) INTO v_member_count
  FROM alliance_members
  WHERE alliance_id = v_membership.alliance_id;
  
  -- If user is the leader
  IF v_membership.leader_id = v_user_id THEN
    IF v_member_count > 1 THEN
      -- Must transfer leadership first
      RETURN jsonb_build_object('success', false, 'error', 'Debes transferir el liderazgo antes de salir');
    END IF;
  END IF;
  
  -- Delete membership
  DELETE FROM alliance_members WHERE user_id = v_user_id;
  
  -- If was the last member, delete the alliance
  IF v_member_count = 1 THEN
    -- Delete any pending applications
    DELETE FROM alliance_applications WHERE alliance_id = v_membership.alliance_id;
    -- Delete any diplomacy
    DELETE FROM alliance_diplomacy WHERE alliance_id = v_membership.alliance_id OR target_alliance_id = v_membership.alliance_id;
    -- Delete alliance
    DELETE FROM alliances WHERE id = v_membership.alliance_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Alianza disuelta');
  ELSE
    -- Update member count
    UPDATE alliances
    SET member_count = member_count - 1
    WHERE id = v_membership.alliance_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Has salido de la alianza');
  END IF;
END;
$$;

-- Function to kick a member
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
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Get user's membership and permissions
  SELECT * INTO v_user_membership
  FROM alliance_members
  WHERE user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No estas en una alianza');
  END IF;
  
  IF NOT COALESCE(v_user_membership.can_kick, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para expulsar miembros');
  END IF;
  
  -- Get target member
  SELECT * INTO v_target_membership
  FROM alliance_members
  WHERE id = p_member_id AND alliance_id = v_user_membership.alliance_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Miembro no encontrado');
  END IF;
  
  -- Cannot kick yourself
  IF v_target_membership.user_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes expulsarte a ti mismo');
  END IF;
  
  -- Cannot kick someone with higher or equal rank
  IF v_target_membership.rank_level >= v_user_membership.rank_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes expulsar a alguien de mayor o igual rango');
  END IF;
  
  -- Get alliance info
  SELECT * INTO v_alliance
  FROM alliances
  WHERE id = v_user_membership.alliance_id;
  
  -- Cannot kick the leader
  IF v_target_membership.user_id = v_alliance.leader_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes expulsar al lider');
  END IF;
  
  -- Delete membership
  DELETE FROM alliance_members WHERE id = p_member_id;
  
  -- Update member count
  UPDATE alliances
  SET member_count = member_count - 1
  WHERE id = v_user_membership.alliance_id;
  
  -- Send notification to kicked member
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

-- Function to transfer leadership
CREATE OR REPLACE FUNCTION transfer_alliance_leadership(p_new_leader_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_membership record;
  v_new_leader_membership record;
  v_alliance record;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Get user's alliance
  SELECT * INTO v_alliance
  FROM alliances
  WHERE leader_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres el lider de ninguna alianza');
  END IF;
  
  -- Get new leader's membership
  SELECT * INTO v_new_leader_membership
  FROM alliance_members
  WHERE user_id = p_new_leader_id AND alliance_id = v_alliance.id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'El jugador no es miembro de tu alianza');
  END IF;
  
  IF p_new_leader_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya eres el lider');
  END IF;
  
  -- Update alliance leader
  UPDATE alliances
  SET leader_id = p_new_leader_id
  WHERE id = v_alliance.id;
  
  -- Promote new leader to max rank
  UPDATE alliance_members
  SET 
    rank_level = 10,
    rank_name = 'Fundador',
    can_invite = true,
    can_kick = true,
    can_edit = true
  WHERE user_id = p_new_leader_id AND alliance_id = v_alliance.id;
  
  -- Demote old leader
  UPDATE alliance_members
  SET 
    rank_level = 8,
    rank_name = 'Presidente'
  WHERE user_id = v_user_id AND alliance_id = v_alliance.id;
  
  -- Send notification to new leader
  INSERT INTO messages (recipient_id, subject, body, message_type)
  VALUES (
    p_new_leader_id,
    'Eres el nuevo lider de ' || v_alliance.name,
    'Has sido nombrado nuevo lider de la alianza [' || v_alliance.tag || '] ' || v_alliance.name || '.',
    'alliance'
  );
  
  RETURN jsonb_build_object('success', true, 'message', 'Liderazgo transferido');
END;
$$;

-- Function to reject application
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
  
  -- Check if user has permission
  SELECT * INTO v_membership
  FROM alliance_members
  WHERE alliance_id = v_application.alliance_id AND user_id = v_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres miembro de esta alianza');
  END IF;
  
  IF NOT COALESCE(v_membership.can_invite, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para gestionar solicitudes');
  END IF;
  
  -- Get alliance info
  SELECT * INTO v_alliance
  FROM alliances
  WHERE id = v_application.alliance_id;
  
  -- Update application status
  UPDATE alliance_applications
  SET 
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = v_user_id
  WHERE id = p_application_id;
  
  -- Send notification
  INSERT INTO messages (recipient_id, subject, body, message_type)
  VALUES (
    v_application.user_id,
    'Solicitud rechazada - ' || v_alliance.name,
    'Tu solicitud para unirte a la alianza [' || v_alliance.tag || '] ' || v_alliance.name || ' ha sido rechazada.',
    'alliance'
  );
  
  RETURN jsonb_build_object('success', true, 'message', 'Solicitud rechazada');
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION leave_alliance() TO authenticated;
GRANT EXECUTE ON FUNCTION kick_alliance_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_alliance_leadership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_alliance_application(uuid) TO authenticated;
