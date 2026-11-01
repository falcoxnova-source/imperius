/*
  # Fix Inactive Accounts Detection Logic

  ## Summary
  Restores the CORRECT logic for categorizing inactive accounts based on 
  ACTIVITY TIME, not points. The previous optimization incorrectly changed
  the business logic.

  ## Bug Fixed
  - User "Reach" with 108 hours of activity was showing as "never_played"
    because they had 0 points
  - The correct behavior is to categorize by TIME of activity:
    - never_played: less than 1 hour between created_at and last_activity
    - first_day_only: between 1-24 hours of activity
    - abandoned: more than 24 hours of activity

  ## Changes
  1. Restores original category logic based on activity time
  2. Fixes admin_get_inactive_accounts_detailed function
  3. Updates admin_get_inactive_accounts_summary to match
  4. Keeps performance optimizations (indexes, timeouts)
*/

-- Drop existing functions to recreate with correct logic
DROP FUNCTION IF EXISTS admin_get_inactive_accounts_detailed(int, text, int, int);
DROP FUNCTION IF EXISTS admin_get_inactive_accounts_detailed(int, text);

-- Recreate with CORRECT logic based on activity time
CREATE OR REPLACE FUNCTION admin_get_inactive_accounts_detailed(
  p_days_inactive int DEFAULT 7,
  p_category text DEFAULT 'all',
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
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
  usdt_balance numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_total_count bigint;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  
  SELECT p.is_admin INTO v_is_admin FROM profiles p WHERE p.id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador';
  END IF;

  SELECT COUNT(*) INTO v_total_count
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
        AND p.last_activity IS NOT NULL
        AND EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) >= 86400
      )
    );
  
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
    COALESCE(p.usdt_balance, 0) as usdt_balance,
    v_total_count as total_count
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
        AND p.last_activity IS NOT NULL
        AND EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) >= 86400
      )
    )
  ORDER BY 
    CASE 
      WHEN p.last_activity IS NULL 
           OR p.last_activity = p.created_at
           OR EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 3600 
      THEN 1
      WHEN EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 86400 
      THEN 2
      ELSE 3
    END,
    (now() - COALESCE(p.last_activity, p.created_at)) DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

-- Update summary function to match correct logic
CREATE OR REPLACE FUNCTION admin_get_inactive_accounts_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_result record;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado');
  END IF;

  SELECT
    COUNT(*) FILTER (
      WHERE (
        last_activity IS NULL 
        OR last_activity = created_at
        OR EXTRACT(EPOCH FROM (last_activity - created_at)) < 3600
      )
      AND (now() - created_at) > interval '1 day'
    ) as never_played,
    COUNT(*) FILTER (
      WHERE last_activity IS NOT NULL
      AND EXTRACT(EPOCH FROM (last_activity - created_at)) >= 3600
      AND EXTRACT(EPOCH FROM (last_activity - created_at)) < 86400
      AND (now() - last_activity) > interval '7 days'
    ) as first_day_only_7d_inactive,
    COUNT(*) FILTER (
      WHERE COALESCE(points_buildings, 0) = 0
      AND (now() - COALESCE(last_activity, created_at)) > interval '7 days'
    ) as abandoned_7d,
    COUNT(*) FILTER (
      WHERE COALESCE(points_buildings, 0) = 0
      AND (now() - COALESCE(last_activity, created_at)) > interval '14 days'
    ) as abandoned_14d,
    COUNT(*) FILTER (
      WHERE COALESCE(points_buildings, 0) = 0
      AND (now() - COALESCE(last_activity, created_at)) > interval '30 days'
    ) as abandoned_30d
  INTO v_result
  FROM profiles p
  WHERE COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false;

  RETURN jsonb_build_object(
    'success', true,
    'summary', jsonb_build_object(
      'never_played', COALESCE(v_result.never_played, 0),
      'first_day_only_7d_inactive', COALESCE(v_result.first_day_only_7d_inactive, 0),
      'abandoned_7d', COALESCE(v_result.abandoned_7d, 0),
      'abandoned_14d', COALESCE(v_result.abandoned_14d, 0),
      'abandoned_30d', COALESCE(v_result.abandoned_30d, 0)
    ),
    'description', jsonb_build_object(
      'never_played', 'Cuentas que nunca jugaron (menos de 1 hora de actividad)',
      'first_day_only_7d_inactive', 'Jugaron solo el primer dia (1-24h) y llevan 7+ dias inactivos',
      'abandoned_7d', 'Sin edificios y 7+ dias inactivos',
      'abandoned_14d', 'Sin edificios y 14+ dias inactivos',
      'abandoned_30d', 'Sin edificios y 30+ dias inactivos'
    )
  );
END;
$$;

-- Update purge function to use correct category logic
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

GRANT EXECUTE ON FUNCTION admin_get_inactive_accounts_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_inactive_accounts_detailed(int, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_purge_inactive_account(uuid) TO authenticated;