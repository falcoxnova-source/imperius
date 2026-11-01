CREATE OR REPLACE FUNCTION public.secure_apply_to_alliance(p_alliance_id uuid, p_message text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_member_count int;
  v_max_members int := 3;
  v_is_open boolean;
  v_existing_member boolean;
  v_existing_application boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM alliance_members WHERE user_id = v_user_id
  ) INTO v_existing_member;

  IF v_existing_member THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya perteneces a una alianza');
  END IF;

  SELECT is_open INTO v_is_open FROM alliances WHERE id = p_alliance_id;
  IF v_is_open IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alianza no encontrada');
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM alliance_members WHERE alliance_id = p_alliance_id;

  IF v_member_count >= v_max_members THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'La alianza ha alcanzado el limite maximo de ' || v_max_members || ' miembros'
    );
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM alliance_applications
    WHERE user_id = v_user_id AND alliance_id = p_alliance_id AND status = 'pending'
  ) INTO v_existing_application;

  IF v_existing_application THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una solicitud pendiente para esta alianza');
  END IF;

  INSERT INTO alliance_applications (alliance_id, user_id, message, status)
  VALUES (p_alliance_id, v_user_id, COALESCE(p_message, ''), 'pending');

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.secure_apply_to_alliance(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
