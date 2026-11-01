/*
  # Fix Inactive Accounts Criteria - Consistent with Ranking

  ## Summary
  Updates the admin_get_inactive_accounts_detailed function to use
  POINTS-based criteria instead of TIME-based criteria for categorization.
  This ensures consistency with the ranking system.

  ## Changes
  - "never_played": users with 0 total points (truly never played)
  - "first_day_only": users with points but played less than 24 hours
  - "abandoned": users with points who played more than 24 hours but are inactive

  ## Why This Change
  Previously, a user could have points (appear in ranking) but still be
  categorized as "never_played" because they played for less than 1 hour.
  This was confusing because:
  - Ranking showed 121 users (points > 0)
  - "Never played" showed 195 users (time < 1 hour)
  - But 91 of those "never played" users actually had points

  Now the criteria is consistent:
  - never_played = 0 points (truly never contributed to the game)
  - These users do NOT appear in ranking
*/

DROP FUNCTION IF EXISTS admin_get_inactive_accounts_detailed(int, text, text, text, int, int);

CREATE OR REPLACE FUNCTION admin_get_inactive_accounts_detailed(
  p_days_inactive int DEFAULT 7,
  p_category text DEFAULT 'all',
  p_sort_by text DEFAULT 'days_inactive',
  p_sort_order text DEFAULT 'desc',
  p_limit int DEFAULT 50,
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
  ranking_position bigint,
  planet_count bigint,
  has_alliance boolean,
  fxu_balance numeric,
  usdt_balance numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_total bigint;
BEGIN
  v_admin_id := auth.uid();
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  
  SELECT p.is_admin INTO v_is_admin FROM profiles p WHERE p.id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM profiles p
  WHERE 
    COALESCE(p.is_admin, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND (now() - COALESCE(p.last_activity, p.created_at)) > (p_days_inactive || ' days')::interval
    AND (
      p_category = 'all'
      OR (p_category = 'never_played' AND COALESCE(p.points_total, 0) = 0)
      OR (
        p_category = 'first_day_only'
        AND COALESCE(p.points_total, 0) > 0
        AND EXTRACT(EPOCH FROM (COALESCE(p.last_activity, p.created_at) - p.created_at)) < 86400
      )
      OR (
        p_category = 'abandoned'
        AND COALESCE(p.points_total, 0) > 0
        AND EXTRACT(EPOCH FROM (COALESCE(p.last_activity, p.created_at) - p.created_at)) >= 86400
      )
    );
  
  RETURN QUERY
  WITH ranked_profiles AS (
    SELECT 
      pr.id,
      pr.username,
      pr.email,
      pr.created_at as profile_created_at,
      pr.last_activity,
      pr.points_buildings,
      pr.points_total,
      pr.fxu_balance,
      pr.usdt_balance,
      ROW_NUMBER() OVER (ORDER BY COALESCE(pr.points_total, 0) DESC, pr.created_at ASC) as rank_pos
    FROM profiles pr
    WHERE COALESCE(pr.is_admin, false) = false
      AND COALESCE(pr.is_banned, false) = false
  )
  SELECT 
    rp.id as user_id,
    rp.username,
    rp.email,
    rp.profile_created_at as created_at,
    rp.last_activity,
    EXTRACT(DAY FROM (now() - COALESCE(rp.last_activity, rp.profile_created_at)))::int as days_inactive,
    ROUND(EXTRACT(EPOCH FROM (COALESCE(rp.last_activity, rp.profile_created_at) - rp.profile_created_at)) / 3600.0, 2) as hours_played,
    CASE
      WHEN COALESCE(rp.points_total, 0) = 0 THEN 'never_played'
      WHEN EXTRACT(EPOCH FROM (COALESCE(rp.last_activity, rp.profile_created_at) - rp.profile_created_at)) < 86400 THEN 'first_day_only'
      ELSE 'abandoned'
    END as category,
    COALESCE(rp.points_buildings, 0)::int as points_buildings,
    COALESCE(rp.points_total, 0)::int as points_total,
    CASE WHEN COALESCE(rp.points_total, 0) > 0 THEN rp.rank_pos ELSE NULL END as ranking_position,
    (SELECT COUNT(*) FROM planets pl WHERE pl.user_id = rp.id) as planet_count,
    EXISTS (SELECT 1 FROM alliance_members am WHERE am.user_id = rp.id) as has_alliance,
    COALESCE(rp.fxu_balance, 0) as fxu_balance,
    COALESCE(rp.usdt_balance, 0) as usdt_balance,
    v_total as total_count
  FROM ranked_profiles rp
  WHERE 
    (now() - COALESCE(rp.last_activity, rp.profile_created_at)) > (p_days_inactive || ' days')::interval
    AND (
      p_category = 'all'
      OR (p_category = 'never_played' AND COALESCE(rp.points_total, 0) = 0)
      OR (
        p_category = 'first_day_only'
        AND COALESCE(rp.points_total, 0) > 0
        AND EXTRACT(EPOCH FROM (COALESCE(rp.last_activity, rp.profile_created_at) - rp.profile_created_at)) < 86400
      )
      OR (
        p_category = 'abandoned'
        AND COALESCE(rp.points_total, 0) > 0
        AND EXTRACT(EPOCH FROM (COALESCE(rp.last_activity, rp.profile_created_at) - rp.profile_created_at)) >= 86400
      )
    )
  ORDER BY 
    CASE 
      WHEN p_sort_by = 'ranking_position' AND p_sort_order = 'asc' THEN rp.rank_pos 
    END ASC NULLS LAST,
    CASE 
      WHEN p_sort_by = 'ranking_position' AND p_sort_order = 'desc' THEN rp.rank_pos 
    END DESC NULLS LAST,
    CASE 
      WHEN p_sort_by = 'points_total' AND p_sort_order = 'asc' THEN COALESCE(rp.points_total, 0) 
    END ASC,
    CASE 
      WHEN p_sort_by = 'points_total' AND p_sort_order = 'desc' THEN COALESCE(rp.points_total, 0) 
    END DESC,
    CASE 
      WHEN p_sort_by = 'days_inactive' AND p_sort_order = 'asc' THEN EXTRACT(DAY FROM (now() - COALESCE(rp.last_activity, rp.profile_created_at)))
    END ASC,
    CASE 
      WHEN p_sort_by = 'days_inactive' AND p_sort_order = 'desc' THEN EXTRACT(DAY FROM (now() - COALESCE(rp.last_activity, rp.profile_created_at)))
    END DESC,
    CASE 
      WHEN p_sort_by NOT IN ('ranking_position', 'points_total', 'days_inactive') THEN EXTRACT(DAY FROM (now() - COALESCE(rp.last_activity, rp.profile_created_at)))
    END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_inactive_accounts_detailed(int, text, text, text, int, int) TO authenticated;
