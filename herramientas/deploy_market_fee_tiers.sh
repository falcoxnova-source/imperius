#!/bin/bash
set -e

echo "=== Backup current function definitions ==="
docker exec xnova-database psql -U postgres -d postgres -c \
  "SELECT pg_get_functiondef('get_market_fee_for_user(uuid)'::regprocedure);" \
  > /tmp/market_fee_backup_$(date +%s).txt 2>&1 || true
echo "Backup saved."

echo "=== Current fee for sample ranks (before) ==="
docker exec xnova-database psql -U postgres -d postgres -c \
  "SELECT 'rank check helper'; SELECT pg_get_functiondef('get_market_fee_for_user(uuid)'::regprocedure);" | grep -E "RETURN [0-9]" || true

echo "=== Applying new tiers ==="
docker exec -i xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE OR REPLACE FUNCTION get_market_fee_for_user(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank integer;
  v_is_plus boolean;
BEGIN
  v_is_plus := is_user_plus(p_user_id);

  IF v_is_plus THEN
    RETURN 10;
  END IF;

  SELECT COALESCE(rank_position, 9999) INTO v_rank
  FROM profiles WHERE id = p_user_id;

  IF v_rank <= 50 THEN
    RETURN 15;
  ELSIF v_rank <= 100 THEN
    RETURN 20;
  ELSIF v_rank <= 200 THEN
    RETURN 30;
  ELSE
    RETURN 40;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_my_market_fee()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fee numeric;
  v_is_plus boolean;
  v_rank integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('fee_percent', 40, 'is_plus', false, 'rank', 9999);
  END IF;

  v_is_plus := is_user_plus(v_user_id);

  SELECT COALESCE(rank_position, 9999) INTO v_rank
  FROM profiles WHERE id = v_user_id;

  v_fee := get_market_fee_for_user(v_user_id);

  RETURN jsonb_build_object(
    'fee_percent', v_fee,
    'is_plus', v_is_plus,
    'rank', v_rank
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_market_fee_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_market_fee() TO authenticated;
SQL

echo "=== Verify new tiers (after) ==="
docker exec xnova-database psql -U postgres -d postgres -c \
  "SELECT pg_get_functiondef('get_market_fee_for_user(uuid)'::regprocedure);" | grep -E "RETURN [0-9]"

echo "=== Done ==="
