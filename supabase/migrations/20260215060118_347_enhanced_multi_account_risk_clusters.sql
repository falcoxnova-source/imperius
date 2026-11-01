/*
  # Enhanced Multi-Account Detection - Risk Clusters

  1. New Functions:
    - `get_multi_account_risk_clusters`: Identifies groups of accounts connected by
      multiple risk indicators (shared IP, shared fingerprint, suspicious transfers).
      Returns clusters with combined risk scores and severity levels.

  2. Notes:
    - Purely additive - does NOT modify any existing tables or functions
    - Reads from existing login_sessions, suspicious_accounts, and account_interaction_log tables
    - Admin-only access (checks is_admin)
    - Lookback window: 60 days for all indicators
    - Risk scoring: fingerprint sharing weighted highest, then IP, then transfers
*/

CREATE OR REPLACE FUNCTION get_multi_account_risk_clusters()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  WITH ip_pairs AS (
    SELECT
      LEAST(a.user_id, b.user_id) AS user1_id,
      GREATEST(a.user_id, b.user_id) AS user2_id,
      'shared_ip' AS indicator,
      COUNT(DISTINCT a.ip_address) AS shared_count
    FROM login_sessions a
    JOIN login_sessions b
      ON a.ip_address = b.ip_address
      AND a.user_id < b.user_id
      AND b.created_at > now() - interval '60 days'
    WHERE a.created_at > now() - interval '60 days'
    GROUP BY LEAST(a.user_id, b.user_id), GREATEST(a.user_id, b.user_id)
  ),
  fingerprint_pairs AS (
    SELECT
      LEAST(a.user_id, b.user_id) AS user1_id,
      GREATEST(a.user_id, b.user_id) AS user2_id,
      'shared_fingerprint' AS indicator,
      COUNT(DISTINCT a.fingerprint) AS shared_count
    FROM login_sessions a
    JOIN login_sessions b
      ON a.fingerprint = b.fingerprint
      AND a.fingerprint IS NOT NULL
      AND a.fingerprint != ''
      AND a.user_id < b.user_id
      AND b.created_at > now() - interval '60 days'
    WHERE a.created_at > now() - interval '60 days'
    GROUP BY LEAST(a.user_id, b.user_id), GREATEST(a.user_id, b.user_id)
  ),
  transfer_pairs AS (
    SELECT
      LEAST(ail.from_user_id, ail.to_user_id) AS user1_id,
      GREATEST(ail.from_user_id, ail.to_user_id) AS user2_id,
      'transfers' AS indicator,
      COUNT(*) AS shared_count
    FROM account_interaction_log ail
    WHERE ail.interaction_type = 'transport'
      AND ail.created_at > now() - interval '60 days'
    GROUP BY LEAST(ail.from_user_id, ail.to_user_id), GREATEST(ail.from_user_id, ail.to_user_id)
    HAVING COUNT(*) >= 2
  ),
  all_pairs AS (
    SELECT user1_id, user2_id, indicator, shared_count FROM ip_pairs
    UNION ALL
    SELECT user1_id, user2_id, indicator, shared_count FROM fingerprint_pairs
    UNION ALL
    SELECT user1_id, user2_id, indicator, shared_count FROM transfer_pairs
  ),
  pair_summary AS (
    SELECT
      ap.user1_id,
      ap.user2_id,
      p1.username AS user1_name,
      p2.username AS user2_name,
      COUNT(DISTINCT ap.indicator) AS indicator_count,
      jsonb_agg(DISTINCT jsonb_build_object(
        'type', ap.indicator,
        'count', ap.shared_count
      )) AS indicators,
      CASE
        WHEN COUNT(DISTINCT ap.indicator) >= 3 THEN 'critical'
        WHEN COUNT(DISTINCT ap.indicator) >= 2 THEN 'high'
        ELSE 'medium'
      END AS risk_level,
      LEAST(
        SUM(
          CASE ap.indicator
            WHEN 'shared_fingerprint' THEN 40 * LEAST(ap.shared_count, 5)
            WHEN 'shared_ip' THEN 25 * LEAST(ap.shared_count, 5)
            WHEN 'transfers' THEN 15 + LEAST(ap.shared_count * 2, 30)
            ELSE 10
          END
        ),
        100
      ) AS risk_score,
      EXISTS (
        SELECT 1 FROM suspicious_accounts sa
        WHERE ((sa.user_id = ap.user1_id AND sa.linked_user_id = ap.user2_id)
            OR (sa.user_id = ap.user2_id AND sa.linked_user_id = ap.user1_id))
          AND sa.is_confirmed_multi = true
      ) AS already_confirmed
    FROM all_pairs ap
    JOIN profiles p1 ON p1.id = ap.user1_id
    JOIN profiles p2 ON p2.id = ap.user2_id
    GROUP BY ap.user1_id, ap.user2_id, p1.username, p2.username
  )
  SELECT jsonb_build_object(
    'success', true,
    'clusters', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'user1_id', ps.user1_id,
          'user2_id', ps.user2_id,
          'user1_name', ps.user1_name,
          'user2_name', ps.user2_name,
          'indicator_count', ps.indicator_count,
          'indicators', ps.indicators,
          'risk_level', ps.risk_level,
          'risk_score', ps.risk_score,
          'already_confirmed', ps.already_confirmed
        ) ORDER BY ps.risk_score DESC
      )
      FROM pair_summary ps),
      '[]'::jsonb
    ),
    'total_pairs', (SELECT COUNT(*) FROM pair_summary),
    'critical_count', (SELECT COUNT(*) FROM pair_summary WHERE risk_level = 'critical'),
    'high_count', (SELECT COUNT(*) FROM pair_summary WHERE risk_level = 'high'),
    'medium_count', (SELECT COUNT(*) FROM pair_summary WHERE risk_level = 'medium')
  ) INTO v_result;

  RETURN v_result;
END;
$$;
