/*
  # Sistema Mejorado de Deteccion de Cuentas Inactivas

  ## Resumen
  Mejora el sistema de limpieza de cuentas inactivas con criterios mas especificos:
  
  1. Cuentas que NUNCA jugaron (sin actividad despues de crear la cuenta)
  2. Cuentas que jugaron SOLO el primer dia y llevan 7+ dias inactivas
  3. Eliminacion completa y segura de todos los datos relacionados

  ## Categorias de Cuentas Inactivas
  
  - **never_played**: Cuentas donde last_activity es igual o muy cercano a created_at (< 1 hora)
  - **first_day_only**: Cuentas donde last_activity esta dentro de las primeras 24 horas de created_at
  - **abandoned**: Cuentas con points_buildings = 0 y mas de X dias sin actividad

  ## Nuevas Funciones
  
  1. `admin_get_inactive_accounts_detailed(p_days_inactive, p_category)`
     - Filtra por categoria: 'all', 'never_played', 'first_day_only', 'abandoned'
     - Muestra informacion detallada incluyendo categoria
  
  2. `admin_get_inactive_accounts_summary()`
     - Resumen rapido de cuantas cuentas hay en cada categoria
  
  3. `admin_purge_inactive_account(p_user_id)`
     - Eliminacion completa garantizada de TODOS los datos
     - Incluye tablas adicionales que la version anterior no cubria

  ## Seguridad
  - Solo admins pueden ejecutar estas funciones
  - Validaciones estrictas antes de eliminar
  - No se pueden eliminar cuentas de admin
  - Logs de auditoria de eliminaciones
*/

-- Tabla para registrar eliminaciones de cuentas (auditoria)
CREATE TABLE IF NOT EXISTS admin_account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id uuid NOT NULL,
  deleted_username text NOT NULL,
  deleted_email text,
  deletion_category text NOT NULL,
  days_inactive int NOT NULL,
  points_total int DEFAULT 0,
  deleted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE admin_account_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view deletion logs"
  ON admin_account_deletions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "System can insert deletion logs"
  ON admin_account_deletions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Funcion para obtener resumen de cuentas inactivas
CREATE OR REPLACE FUNCTION admin_get_inactive_accounts_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_never_played bigint;
  v_first_day_only bigint;
  v_abandoned_7d bigint;
  v_abandoned_14d bigint;
  v_abandoned_30d bigint;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado');
  END IF;

  SELECT COUNT(*) INTO v_never_played
  FROM profiles p
  WHERE COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND (
      p.last_activity IS NULL 
      OR p.last_activity = p.created_at
      OR EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 3600
    )
    AND (now() - p.created_at) > interval '1 day';

  SELECT COUNT(*) INTO v_first_day_only
  FROM profiles p
  WHERE COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND p.last_activity IS NOT NULL
    AND EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) >= 3600
    AND EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 86400
    AND (now() - p.last_activity) > interval '7 days';

  SELECT COUNT(*) INTO v_abandoned_7d
  FROM profiles p
  WHERE COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.points_buildings, 0) = 0
    AND (now() - COALESCE(p.last_activity, p.created_at)) > interval '7 days';

  SELECT COUNT(*) INTO v_abandoned_14d
  FROM profiles p
  WHERE COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.points_buildings, 0) = 0
    AND (now() - COALESCE(p.last_activity, p.created_at)) > interval '14 days';

  SELECT COUNT(*) INTO v_abandoned_30d
  FROM profiles p
  WHERE COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.points_buildings, 0) = 0
    AND (now() - COALESCE(p.last_activity, p.created_at)) > interval '30 days';

  RETURN jsonb_build_object(
    'success', true,
    'summary', jsonb_build_object(
      'never_played', v_never_played,
      'first_day_only_7d_inactive', v_first_day_only,
      'abandoned_7d', v_abandoned_7d,
      'abandoned_14d', v_abandoned_14d,
      'abandoned_30d', v_abandoned_30d
    ),
    'description', jsonb_build_object(
      'never_played', 'Cuentas creadas que nunca jugaron (sin actividad real)',
      'first_day_only_7d_inactive', 'Jugaron solo el primer dia y llevan 7+ dias inactivos',
      'abandoned_7d', 'Sin edificios y 7+ dias inactivos',
      'abandoned_14d', 'Sin edificios y 14+ dias inactivos',
      'abandoned_30d', 'Sin edificios y 30+ dias inactivos'
    )
  );
END;
$$;

-- Funcion detallada para obtener cuentas inactivas por categoria
CREATE OR REPLACE FUNCTION admin_get_inactive_accounts_detailed(
  p_days_inactive int DEFAULT 7,
  p_category text DEFAULT 'all'
)
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  created_at timestamptz,
  last_activity timestamptz,
  days_inactive int,
  hours_played numeric,
  category text,
  points_buildings int,
  points_total int,
  planet_count bigint,
  has_alliance boolean,
  fxu_balance numeric,
  usdt_balance numeric
)
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
    RAISE EXCEPTION 'No autenticado';
  END IF;
  
  SELECT p.is_admin INTO v_is_admin FROM profiles p WHERE p.id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.username,
    p.email,
    p.created_at,
    p.last_activity,
    EXTRACT(DAY FROM (now() - COALESCE(p.last_activity, p.created_at)))::int as days_inactive,
    ROUND(EXTRACT(EPOCH FROM (COALESCE(p.last_activity, p.created_at) - p.created_at)) / 3600.0, 2) as hours_played,
    CASE
      WHEN p.last_activity IS NULL 
           OR p.last_activity = p.created_at
           OR EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 3600 
      THEN 'never_played'
      WHEN EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 86400 
      THEN 'first_day_only'
      ELSE 'abandoned'
    END as category,
    COALESCE(p.points_buildings, 0)::int as points_buildings,
    COALESCE(p.points_total, 0)::int as points_total,
    (SELECT COUNT(*) FROM planets pl WHERE pl.user_id = p.id) as planet_count,
    EXISTS (SELECT 1 FROM alliance_members am WHERE am.user_id = p.id) as has_alliance,
    COALESCE(p.fxu_balance, 0) as fxu_balance,
    COALESCE(p.usdt_balance, 0) as usdt_balance
  FROM profiles p
  WHERE 
    COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND (now() - COALESCE(p.last_activity, p.created_at)) > (p_days_inactive || ' days')::interval
    AND (
      p_category = 'all'
      OR (
        p_category = 'never_played' 
        AND (
          p.last_activity IS NULL 
          OR p.last_activity = p.created_at
          OR EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 3600
        )
      )
      OR (
        p_category = 'first_day_only'
        AND p.last_activity IS NOT NULL
        AND EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) >= 3600
        AND EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 86400
      )
      OR (
        p_category = 'abandoned'
        AND COALESCE(p.points_buildings, 0) = 0
      )
    )
  ORDER BY 
    category,
    (now() - COALESCE(p.last_activity, p.created_at)) DESC;
END;
$$;

-- Funcion de eliminacion completa y segura
CREATE OR REPLACE FUNCTION admin_purge_inactive_account(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_target_profile record;
  v_days_inactive int;
  v_hours_played numeric;
  v_category text;
  v_planet_count int;
  v_deleted_data jsonb;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado');
  END IF;
  
  SELECT * INTO v_target_profile FROM profiles WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;
  
  IF COALESCE(v_target_profile.is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede eliminar una cuenta de administrador');
  END IF;
  
  v_days_inactive := EXTRACT(DAY FROM (now() - COALESCE(v_target_profile.last_activity, v_target_profile.created_at)))::int;
  v_hours_played := ROUND(EXTRACT(EPOCH FROM (COALESCE(v_target_profile.last_activity, v_target_profile.created_at) - v_target_profile.created_at)) / 3600.0, 2);
  
  IF v_target_profile.last_activity IS NULL 
     OR v_target_profile.last_activity = v_target_profile.created_at
     OR EXTRACT(EPOCH FROM (v_target_profile.last_activity - v_target_profile.created_at)) < 3600 THEN
    v_category := 'never_played';
  ELSIF EXTRACT(EPOCH FROM (v_target_profile.last_activity - v_target_profile.created_at)) < 86400 THEN
    v_category := 'first_day_only';
  ELSE
    v_category := 'abandoned';
  END IF;

  SELECT COUNT(*)::int INTO v_planet_count FROM planets WHERE user_id = p_user_id;

  DELETE FROM alliance_members WHERE user_id = p_user_id;
  DELETE FROM alliance_applications WHERE user_id = p_user_id;
  
  UPDATE fleets 
  SET status = 'cancelled'
  WHERE user_id = p_user_id AND status IN ('traveling', 'returning');
  
  UPDATE fleets 
  SET status = 'returning', 
      arrival_time = now() + ((now() - departure_time) * 0.5)
  WHERE target_user_id = p_user_id AND status = 'traveling';
  
  DELETE FROM messages WHERE sender_id = p_user_id OR recipient_id = p_user_id;
  DELETE FROM user_officers WHERE user_id = p_user_id;
  DELETE FROM market_listings WHERE seller_id = p_user_id;
  DELETE FROM research_queue WHERE user_id = p_user_id;
  
  DELETE FROM building_queue WHERE planet_id IN (SELECT id FROM planets WHERE user_id = p_user_id);
  DELETE FROM shipyard_queue WHERE planet_id IN (SELECT id FROM planets WHERE user_id = p_user_id);
  
  DELETE FROM planets WHERE user_id = p_user_id;
  DELETE FROM user_technologies WHERE user_id = p_user_id;
  DELETE FROM wallet_transactions WHERE user_id = p_user_id;
  DELETE FROM login_sessions WHERE user_id = p_user_id;
  
  DELETE FROM telegram_user_tasks WHERE user_id = p_user_id;
  DELETE FROM plus_subscriptions WHERE user_id = p_user_id;
  DELETE FROM supply_box_claims WHERE user_id = p_user_id;
  DELETE FROM public_chat_messages WHERE user_id = p_user_id;

  v_deleted_data := jsonb_build_object(
    'planets_deleted', v_planet_count,
    'fxu_balance', COALESCE(v_target_profile.fxu_balance, 0),
    'usdt_balance', COALESCE(v_target_profile.usdt_balance, 0),
    'points_total', COALESCE(v_target_profile.points_total, 0)
  );

  INSERT INTO admin_account_deletions (
    deleted_user_id,
    deleted_username,
    deleted_email,
    deletion_category,
    days_inactive,
    points_total,
    deleted_by,
    metadata
  ) VALUES (
    p_user_id,
    v_target_profile.username,
    v_target_profile.email,
    v_category,
    v_days_inactive,
    COALESCE(v_target_profile.points_total, 0),
    v_admin_id,
    v_deleted_data
  );
  
  DELETE FROM profiles WHERE id = p_user_id;
  
  DELETE FROM auth.users WHERE id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Cuenta eliminada completamente: ' || v_target_profile.username,
    'details', jsonb_build_object(
      'username', v_target_profile.username,
      'email', v_target_profile.email,
      'category', v_category,
      'days_inactive', v_days_inactive,
      'hours_played', v_hours_played,
      'planets_deleted', v_planet_count,
      'fxu_balance', COALESCE(v_target_profile.fxu_balance, 0),
      'usdt_balance', COALESCE(v_target_profile.usdt_balance, 0)
    )
  );
END;
$$;

-- Funcion de eliminacion masiva por categoria
CREATE OR REPLACE FUNCTION admin_bulk_purge_inactive_accounts(
  p_category text DEFAULT 'never_played',
  p_days_inactive int DEFAULT 7,
  p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_deleted_count int := 0;
  v_failed_count int := 0;
  v_user_record record;
  v_result jsonb;
  v_deleted_users jsonb[] := ARRAY[]::jsonb[];
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado');
  END IF;

  IF p_category NOT IN ('never_played', 'first_day_only', 'abandoned', 'all') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Categoria invalida. Use: never_played, first_day_only, abandoned, all');
  END IF;

  FOR v_user_record IN 
    SELECT user_id, username 
    FROM admin_get_inactive_accounts_detailed(p_days_inactive, p_category)
    LIMIT p_limit
  LOOP
    v_result := admin_purge_inactive_account(v_user_record.user_id);
    
    IF (v_result->>'success')::boolean THEN
      v_deleted_count := v_deleted_count + 1;
      v_deleted_users := array_append(v_deleted_users, jsonb_build_object(
        'user_id', v_user_record.user_id,
        'username', v_user_record.username
      ));
    ELSE
      v_failed_count := v_failed_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'category', p_category,
    'days_inactive_threshold', p_days_inactive,
    'deleted_count', v_deleted_count,
    'failed_count', v_failed_count,
    'deleted_users', v_deleted_users,
    'message', v_deleted_count || ' cuentas eliminadas de categoria "' || p_category || '", ' || v_failed_count || ' fallaron'
  );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION admin_get_inactive_accounts_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_inactive_accounts_detailed(int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_purge_inactive_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_bulk_purge_inactive_accounts(text, int, int) TO authenticated;
