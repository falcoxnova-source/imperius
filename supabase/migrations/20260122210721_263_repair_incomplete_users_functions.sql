/*
  # Funciones para reparar cuentas incompletas

  ## Descripcion
  Crea funciones para reparar usuarios que quedaron sin perfil/planeta
  debido a fallos silenciosos en el trigger handle_new_user

  ## Funciones
  1. repair_incomplete_user(uuid) - Repara un usuario individual
  2. repair_all_incomplete_users() - Repara todos los afectados

  ## Seguridad
  - SECURITY DEFINER para bypass RLS
  - Solo repara usuarios sin perfil existente
  - No modifica datos existentes
*/

-- Funcion para reparar un usuario individual
CREATE OR REPLACE FUNCTION repair_incomplete_user(p_user_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_record record;
  v_username text;
  v_referral_code text;
  v_galaxy integer;
  v_system integer;
  v_position integer;
  v_planet_id uuid;
  v_found boolean := false;
BEGIN
  -- Obtener datos del usuario
  SELECT id, email, raw_user_meta_data INTO v_user_record
  FROM auth.users WHERE id = p_user_id;

  IF v_user_record IS NULL THEN
    RETURN '{"success":false,"error":"Usuario no existe"}'::jsonb;
  END IF;

  -- Ya tiene perfil?
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RETURN '{"success":true,"message":"Ya tiene perfil"}'::jsonb;
  END IF;

  -- Username
  v_username := COALESCE(
    NULLIF(TRIM(v_user_record.raw_user_meta_data->>'username'), ''),
    split_part(v_user_record.email, '@', 1),
    'user_' || substr(p_user_id::text, 1, 8)
  );

  IF EXISTS (SELECT 1 FROM profiles WHERE username = v_username) THEN
    v_username := v_username || '_' || substr(p_user_id::text, 1, 4);
  END IF;

  v_referral_code := UPPER(SUBSTRING(p_user_id::text, 1, 8));

  -- Crear perfil
  INSERT INTO profiles (id, username, email, dark_matter, fxu_balance, referral_code)
  VALUES (p_user_id, v_username, v_user_record.email, 0, 0, v_referral_code);

  -- Ya tiene planeta?
  IF EXISTS (SELECT 1 FROM planets WHERE user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', true, 'profile_created', true, 'planet_existed', true);
  END IF;

  -- Buscar posicion libre
  FOR i IN 1..50 LOOP
    v_galaxy := 1 + floor(random() * 3)::integer;
    v_system := 1 + floor(random() * 200)::integer;
    v_position := 4 + floor(random() * 9)::integer;

    IF NOT EXISTS (
      SELECT 1 FROM planets 
      WHERE galaxy = v_galaxy AND solar_system = v_system AND position = v_position
    ) THEN
      v_found := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_found THEN
    v_galaxy := 1; v_system := 1; v_position := 1;
    WHILE EXISTS (SELECT 1 FROM planets WHERE galaxy = v_galaxy AND solar_system = v_system AND position = v_position) LOOP
      v_position := v_position + 1;
      IF v_position > 15 THEN v_position := 1; v_system := v_system + 1; END IF;
      IF v_system > 400 THEN v_system := 1; v_galaxy := v_galaxy + 1; END IF;
    END LOOP;
  END IF;

  -- Crear planeta
  INSERT INTO planets (user_id, name, galaxy, solar_system, position, planet_type, diameter, fields_max, fields_used, temp_min, temp_max, is_main_planet)
  VALUES (p_user_id, 'Planeta Principal', v_galaxy, v_system, v_position, 'planet', 12800, 163, 0, -20 + floor(random()*60)::int, 20 + floor(random()*60)::int, true)
  RETURNING id INTO v_planet_id;

  -- Crear recursos
  INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, metal_per_hour, crystal_per_hour, deuterium_per_hour, energy_used, energy_max)
  VALUES (v_planet_id, 500, 300, 100, 30, 15, 0, 0, 0);

  RETURN jsonb_build_object('success', true, 'username', v_username, 'planet_id', v_planet_id, 'coords', v_galaxy||':'||v_system||':'||v_position);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Funcion para reparar todos
CREATE OR REPLACE FUNCTION repair_all_incomplete_users()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  v_user record;
  v_result jsonb;
  v_ok integer := 0;
  v_fail integer := 0;
BEGIN
  FOR v_user IN 
    SELECT au.id FROM auth.users au
    LEFT JOIN profiles p ON au.id = p.id
    WHERE p.id IS NULL
  LOOP
    v_result := repair_incomplete_user(v_user.id);
    IF (v_result->>'success')::boolean THEN v_ok := v_ok + 1; ELSE v_fail := v_fail + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('repaired', v_ok, 'failed', v_fail);
END;
$$;

GRANT EXECUTE ON FUNCTION repair_incomplete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION repair_all_incomplete_users() TO authenticated;
