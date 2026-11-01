/*
  # Increase alliance member limit from 5 to 10

  1. Changes
    - Updates `accept_alliance_application` function to allow up to 10 members
    - Updates `join_open_alliance` function to allow up to 10 members
  
  2. Notes
    - No data loss, only increases the cap
    - All existing alliances with fewer than 10 members remain valid
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
  v_leader_id uuid;
  v_member_count int;
  v_max_members int := 10;
  v_existing_alliance uuid;
  v_app_status text;
BEGIN
  SELECT alliance_id, user_id, status INTO v_alliance_id, v_applicant_id, v_app_status
  FROM alliance_applications
  WHERE id = p_application_id;

  IF v_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada');
  END IF;

  IF v_app_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La solicitud ya fue procesada');
  END IF;

  SELECT leader_id INTO v_leader_id FROM alliances WHERE id = v_alliance_id;
  IF v_leader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo el lider puede aceptar solicitudes');
  END IF;

  SELECT alliance_id INTO v_existing_alliance FROM profiles WHERE id = v_applicant_id;
  IF v_existing_alliance IS NOT NULL THEN
    UPDATE alliance_applications SET status = 'rejected' WHERE id = p_application_id;
    RETURN jsonb_build_object('success', false, 'error', 'El jugador ya pertenece a una alianza');
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM profiles WHERE alliance_id = v_alliance_id;

  IF v_member_count >= v_max_members THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
    );
  END IF;

  UPDATE profiles SET alliance_id = v_alliance_id WHERE id = v_applicant_id;
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

CREATE OR REPLACE FUNCTION join_open_alliance(p_alliance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_count int;
  v_max_members int := 10;
  v_alliance_type text;
  v_existing_alliance uuid;
BEGIN
  SELECT alliance_id INTO v_existing_alliance FROM profiles WHERE id = auth.uid();
  IF v_existing_alliance IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya perteneces a una alianza');
  END IF;

  SELECT alliance_type INTO v_alliance_type FROM alliances WHERE id = p_alliance_id;
  IF v_alliance_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alianza no encontrada');
  END IF;

  IF v_alliance_type != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta alianza requiere solicitud');
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM profiles WHERE alliance_id = p_alliance_id;

  IF v_member_count >= v_max_members THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
    );
  END IF;

  UPDATE profiles SET alliance_id = p_alliance_id WHERE id = auth.uid();

  UPDATE alliance_applications
  SET status = 'rejected'
  WHERE user_id = auth.uid() AND status = 'pending';

  UPDATE alliances SET member_count = v_member_count + 1 WHERE id = p_alliance_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
