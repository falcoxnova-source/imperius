-- ============================================================
-- Fix: Twitter ranking shows inflated comment/quote counts
-- 
-- Problem: COUNT was including actions with points_awarded = 0
--          so the count showed e.g. 12 comments when only 1 gave points.
-- Fix: Add points_awarded > 0 filter to COUNT expressions.
-- This ONLY changes how the count is displayed. No data is modified.
-- ============================================================

CREATE OR REPLACE FUNCTION get_twitter_social_ranking(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ranking jsonb;
BEGIN
  SELECT jsonb_agg(row_data ORDER BY total_points DESC)
  INTO v_ranking
  FROM (
    SELECT jsonb_build_object(
      'user_id', tl.user_id,
      'twitter_username', tl.twitter_username,
      'username', p.username,
      'total_points', COALESCE(SUM(ta.points_awarded), 0),
      'total_actions', COUNT(ta.id) FILTER (WHERE ta.points_awarded > 0),
      'quote_tweets', COUNT(ta.id) FILTER (WHERE ta.action_type = 'quote_tweet' AND ta.points_awarded > 0),
      'comments', COUNT(ta.id) FILTER (WHERE ta.action_type = 'comment' AND ta.points_awarded > 0)
    ) as row_data,
    COALESCE(SUM(ta.points_awarded), 0) as total_points
    FROM twitter_links tl
    INNER JOIN profiles p ON p.id = tl.user_id
    LEFT JOIN twitter_actions ta ON ta.user_id = tl.user_id AND ta.validated = true
    GROUP BY tl.user_id, tl.twitter_username, p.username
    HAVING COALESCE(SUM(ta.points_awarded), 0) > 0
    ORDER BY total_points DESC
    LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'ranking', COALESCE(v_ranking, '[]'::jsonb)
  );
END;
$$;
