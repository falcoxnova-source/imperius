/*
  # Sistema de Control de Registro

  1. Cambios
    - Agrega columna registration_enabled a admin_speed_settings
    - Funciones para controlar y verificar el estado del registro

  2. Seguridad
    - Solo admins pueden cambiar el estado
    - Función pública para verificar estado del registro
*/

ALTER TABLE admin_speed_settings 
ADD COLUMN IF NOT EXISTS registration_enabled boolean DEFAULT true;

UPDATE admin_speed_settings 
SET registration_enabled = true 
WHERE registration_enabled IS NULL;

CREATE OR REPLACE FUNCTION public_check_registration_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT registration_enabled INTO v_enabled FROM admin_speed_settings WHERE id = 1;
  
  RETURN jsonb_build_object(
    'success', true,
    'enabled', COALESCE(v_enabled, true),
    'message', CASE 
      WHEN NOT COALESCE(v_enabled, true) THEN 'El registro de nuevas cuentas está temporalmente cerrado. Por favor, intenta más tarde.'
      ELSE NULL
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_get_registration_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_enabled boolean;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado');
  END IF;
  
  SELECT registration_enabled INTO v_enabled FROM admin_speed_settings WHERE id = 1;
  
  RETURN jsonb_build_object(
    'success', true,
    'enabled', COALESCE(v_enabled, true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_toggle_registration(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado');
  END IF;
  
  UPDATE admin_speed_settings 
  SET registration_enabled = p_enabled, 
      updated_at = now(), 
      updated_by = v_admin_id
  WHERE id = 1;
  
  RETURN jsonb_build_object(
    'success', true,
    'enabled', p_enabled,
    'message', CASE 
      WHEN p_enabled THEN 'Registro de cuentas ABIERTO'
      ELSE 'Registro de cuentas CERRADO'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public_check_registration_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_get_registration_config() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_registration(boolean) TO authenticated;
