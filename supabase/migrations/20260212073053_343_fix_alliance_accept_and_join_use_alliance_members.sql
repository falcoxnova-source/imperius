/*
  # Fix Alliance Accept/Join Functions - Use alliance_members Table

  Both `accept_alliance_application` and `join_open_alliance` were referencing
  a non-existent `profiles.alliance_id` column. Alliance membership is tracked
  through the `alliance_members` table instead.

  1. Fixed Functions
    - `accept_alliance_application`: Now checks/inserts into `alliance_members`
    - `join_open_alliance`: Now checks/inserts into `alliance_members`

  2. Changes
    - Check existing membership via `alliance_members` instead of `profiles.alliance_id`
    - Count members via `alliance_members` instead of `profiles`
    - Insert into `alliance_members` instead of updating `profiles.alliance_id`
    - Max members set to 10

  3. Important Notes
    - No other functions or tables are modified
    - Leader check still uses `alliances.leader_id` (unchanged)
    - Alliance applications table logic unchanged
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
  v_existing_member boolean;
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

CREATE OR REPLACE FUNCTION join_open_alliance(p_alliance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_count int;
  v_max_members int := 10;
  v_is_open boolean;
  v_existing_member boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM alliance_members WHERE user_id = auth.uid()
  ) INTO v_existing_member;

  IF v_existing_member THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya perteneces a una alianza');
  END IF;

  SELECT is_open INTO v_is_open FROM alliances WHERE id = p_alliance_id;
  IF v_is_open IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alianza no encontrada');
  END IF;

  IF NOT v_is_open THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta alianza requiere solicitud');
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM alliance_members WHERE alliance_id = p_alliance_id;

  IF v_member_count >= v_max_members THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
    );
  END IF;

  INSERT INTO alliance_members (alliance_id, user_id)
  VALUES (p_alliance_id, auth.uid());

  UPDATE alliance_applications
  SET status = 'rejected'
  WHERE user_id = auth.uid() AND status = 'pending';

  UPDATE alliances SET member_count = v_member_count + 1 WHERE id = p_alliance_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
