DROP FUNCTION IF EXISTS get_p2p_reputations_for_users(uuid[]);
CREATE OR REPLACE FUNCTION get_p2p_reputations_for_users(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  total_orders int,
  completed_orders int,
  success_rate numeric,
  rating_avg numeric,
  rating_count int,
  is_banned boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT
    p.id,
    COALESCE(r.total_orders, 0),
    COALESCE(r.completed_orders, 0),
    CASE WHEN COALESCE(r.total_orders,0) > 0
         THEN round((r.completed_orders::numeric * 100 / r.total_orders)::numeric, 1)
         ELSE 0 END,
    CASE WHEN COALESCE(r.rating_count,0) > 0
         THEN round((r.rating_sum::numeric / r.rating_count)::numeric, 2)
         ELSE 0 END,
    COALESCE(r.rating_count, 0),
    COALESCE(r.is_banned, false)
  FROM profiles p
  LEFT JOIN p2p_reputation r ON r.user_id = p.id
  WHERE p.id = ANY(p_user_ids);
$func$;
GRANT EXECUTE ON FUNCTION get_p2p_reputations_for_users(uuid[]) TO authenticated;
