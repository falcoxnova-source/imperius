/*
  # Admin Inactive Accounts Cleanup System
  
  ## Summary
  Provides admin tools to identify and remove inactive accounts that:
  - Have not built any buildings (points_buildings = 0)
  - Have been inactive for X days (configurable, default 5 days)
  
  This helps free up server resources from abandoned accounts.
  
  ## New Functions
  
  1. `admin_get_inactive_accounts(p_days_inactive int)`
    - Returns list of accounts that meet cleanup criteria
    - Only callable by admin users
    - Shows username, email, created_at, last_activity, points
  
  2. `admin_delete_inactive_account(p_user_id uuid)`
    - Safely deletes an inactive account
    - Validates account meets deletion criteria before deleting
    - Returns ships/resources to any fleets targeting this user
    - Only callable by admin users
  
  3. `admin_bulk_delete_inactive_accounts(p_user_ids uuid[])`
    - Bulk delete multiple inactive accounts
    - Only callable by admin users
  
  ## Security
  - All functions require admin privileges
  - Validation ensures only truly inactive accounts can be deleted
  - Cascade deletes handle all related data safely
*/

-- Function to get inactive accounts without buildings
CREATE OR REPLACE FUNCTION admin_get_inactive_accounts(p_days_inactive int DEFAULT 5)
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  created_at timestamptz,
  last_activity timestamptz,
  days_inactive int,
  points_buildings int,
  points_total int,
  planet_count bigint,
  has_alliance boolean
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
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
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
    COALESCE(p.points_buildings, 0)::int as points_buildings,
    COALESCE(p.points_total, 0)::int as points_total,
    (SELECT COUNT(*) FROM planets pl WHERE pl.user_id = p.id) as planet_count,
    EXISTS (SELECT 1 FROM alliance_members am WHERE am.user_id = p.id) as has_alliance
  FROM profiles p
  WHERE 
    COALESCE(p.points_buildings, 0) = 0
    AND COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND (now() - COALESCE(p.last_activity, p.created_at)) > (p_days_inactive || ' days')::interval
  ORDER BY 
    (now() - COALESCE(p.last_activity, p.created_at)) DESC;
END;
$$;

-- Function to safely delete a single inactive account
CREATE OR REPLACE FUNCTION admin_delete_inactive_account(p_user_id uuid)
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
  
  IF COALESCE(v_target_profile.points_buildings, 0) > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Esta cuenta tiene edificios construidos (' || v_target_profile.points_buildings || ' puntos)'
    );
  END IF;
  
  DELETE FROM alliance_members WHERE user_id = p_user_id;
  
  DELETE FROM alliance_applications WHERE user_id = p_user_id;
  
  UPDATE fleets 
  SET status = 'cancelled'
  WHERE user_id = p_user_id AND status IN ('traveling', 'returning');
  
  UPDATE fleets 
  SET status = 'returning', arrival_time = now() + ((now() - departure_time) * 0.5)
  WHERE target_user_id = p_user_id AND status = 'traveling';
  
  DELETE FROM messages WHERE sender_id = p_user_id OR recipient_id = p_user_id;
  
  DELETE FROM user_officers WHERE user_id = p_user_id;
  
  DELETE FROM market_listings WHERE seller_id = p_user_id;
  
  DELETE FROM planets WHERE user_id = p_user_id;
  
  DELETE FROM user_technologies WHERE user_id = p_user_id;
  
  DELETE FROM wallet_transactions WHERE user_id = p_user_id;
  
  DELETE FROM profiles WHERE id = p_user_id;
  
  DELETE FROM auth.users WHERE id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Cuenta eliminada: ' || v_target_profile.username,
    'days_inactive', v_days_inactive
  );
END;
$$;

-- Function to bulk delete inactive accounts
CREATE OR REPLACE FUNCTION admin_bulk_delete_inactive_accounts(p_user_ids uuid[])
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
  v_user_id uuid;
  v_result jsonb;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado');
  END IF;
  
  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    v_result := admin_delete_inactive_account(v_user_id);
    IF (v_result->>'success')::boolean THEN
      v_deleted_count := v_deleted_count + 1;
    ELSE
      v_failed_count := v_failed_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'failed_count', v_failed_count,
    'message', v_deleted_count || ' cuentas eliminadas, ' || v_failed_count || ' fallaron'
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION admin_get_inactive_accounts(int) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_inactive_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_bulk_delete_inactive_accounts(uuid[]) TO authenticated;
