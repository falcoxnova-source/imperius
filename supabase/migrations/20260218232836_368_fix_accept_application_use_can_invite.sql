/*
  # Fix accept_alliance_application - Use can_invite Permission

  1. Changes
    - `accept_alliance_application` now checks `can_invite` permission from `alliance_members`
      instead of only allowing the alliance leader
    - This matches how `reject_alliance_application` already works

  2. Important Notes
    - Members with `can_invite = true` can now accept applications
    - Max members limit remains at 10
    - No other functions or tables are modified
*/

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

  UPDATE alliance_applications
  SET status = 'rejected'
  WHERE user_id = v_applicant_id
    AND status = 'pending'
    AND id != p_application_id;

  UPDATE alliances SET member_count = v_member_count + 1 WHERE id = v_alliance_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
