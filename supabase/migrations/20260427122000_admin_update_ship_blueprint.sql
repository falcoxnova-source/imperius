/*
  # RPC admin para editar planos de naves desde el panel

  Crea la función admin_update_ship_blueprint para que un administrador
  pueda actualizar nombre, descripción, imagen, precio FXU y estado activo
  de cada plano (filas en ship_blueprints).
*/

CREATE OR REPLACE FUNCTION admin_update_ship_blueprint(
  p_blueprint_code text,
  p_name text,
  p_description text,
  p_image_url text,
  p_price_fxu numeric,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT COALESCE(is_admin, false) INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores');
  END IF;

  IF p_price_fxu IS NULL OR p_price_fxu < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio invalido');
  END IF;

  UPDATE ship_blueprints
  SET name        = COALESCE(NULLIF(p_name, ''), name),
      description = p_description,
      image_url   = p_image_url,
      price_fxu   = p_price_fxu,
      is_active   = COALESCE(p_is_active, is_active)
  WHERE code = p_blueprint_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano no existe');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_ship_blueprint(text, text, text, text, numeric, boolean) TO authenticated;
