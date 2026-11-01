/*
  # Fix nested aggregate in get_shared_ip_accounts

  1. Bug Fix:
    - `get_shared_ip_accounts` had `MAX()` nested inside `jsonb_agg()` which PostgreSQL rejects
    - Rewrites the query using a subquery to first compute per-user last login, then aggregates

  2. Notes:
    - No schema changes, only fixes the function body
*/

CREATE OR REPLACE FUNCTION get_shared_ip_accounts()
RETURNS TABLE (
  ip_address text,
  user_count bigint,
  users jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH user_ip_logins AS (
    SELECT
      ls.ip_address AS ip_addr,
      ls.user_id,
      p.username,
      MAX(ls.created_at) AS last_login
    FROM login_sessions ls
    JOIN profiles p ON p.id = ls.user_id
    WHERE ls.created_at > now() - interval '30 days'
    GROUP BY ls.ip_address, ls.user_id, p.username
  )
  SELECT
    uil.ip_addr AS ip_address,
    COUNT(DISTINCT uil.user_id) AS user_count,
    jsonb_agg(
      jsonb_build_object(
        'user_id', uil.user_id,
        'username', uil.username,
        'last_login', uil.last_login
      )
    ) AS users
  FROM user_ip_logins uil
  GROUP BY uil.ip_addr
  HAVING COUNT(DISTINCT uil.user_id) > 1
  ORDER BY COUNT(DISTINCT uil.user_id) DESC
  LIMIT 100;
END;
$$;
