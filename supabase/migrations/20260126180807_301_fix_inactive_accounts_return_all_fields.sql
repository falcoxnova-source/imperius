/*
  # Fix admin_get_inactive_accounts - Return all required fields

  ## Summary
  Update the function to return all fields needed by the frontend:
  - category (calculated based on activity patterns)
  - hours_played (total hours from account creation to last activity)
  - fxu_balance (current FXU balance)
  - days_inactive
  - points_total
*/

DROP FUNCTION IF EXISTS admin_get_inactive_accounts(int);

CREATE OR REPLACE FUNCTION admin_get_inactive_accounts(p_days_inactive int DEFAULT 7)
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  created_at timestamptz,
  last_activity timestamptz,
  days_inactive int,
  hours_played numeric,
  category text,
  points_total int,
  fxu_balance numeric,
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
    ROUND(EXTRACT(EPOCH FROM (COALESCE(p.last_activity, p.created_at) - p.created_at)) / 3600.0, 2)::numeric as hours_played,
    CASE
      WHEN p.last_activity IS NULL 
           OR p.last_activity = p.created_at
           OR EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 3600 
      THEN 'never_played'
      WHEN EXTRACT(EPOCH FROM (p.last_activity - p.created_at)) < 86400 
      THEN 'first_day_only'
      ELSE 'abandoned'
    END as category,
    COALESCE(p.points_total, 0)::int as points_total,
    COALESCE(p.fxu_balance, 0)::numeric as fxu_balance,
    (SELECT COUNT(*) FROM planets pl WHERE pl.user_id = p.id) as planet_count,
    EXISTS (SELECT 1 FROM alliance_members am WHERE am.user_id = p.id) as has_alliance
  FROM profiles p
  WHERE 
    COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND (now() - COALESCE(p.last_activity, p.created_at)) > (p_days_inactive || ' days')::interval
  ORDER BY 
    (now() - COALESCE(p.last_activity, p.created_at)) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_inactive_accounts(int) TO authenticated;