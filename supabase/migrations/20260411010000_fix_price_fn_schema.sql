-- =====================================================================
-- FIX: set_live_tung_price / get_live_tung_price_usd were created in the
-- `auth` schema (because the postgres role search_path is `auth, public`).
-- PostgREST only exposes `public`, and the purchase RPCs resolve them via
-- public. Recreate both explicitly in `public` and drop the auth copies.
-- =====================================================================

DROP FUNCTION IF EXISTS auth.set_live_tung_price(numeric);
DROP FUNCTION IF EXISTS auth.get_live_tung_price_usd();

CREATE OR REPLACE FUNCTION public.set_live_tung_price(p_price numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_price IS NULL OR p_price <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO game_settings (key, value, description, updated_at)
  VALUES (
    'tung_price_usd',
    p_price::text,
    'Live TUNG price in USD (DexScreener, auto-updated every minute by refresh_tung_price via pg_cron)',
    now()
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_live_tung_price(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_live_tung_price(numeric) FROM anon;
REVOKE ALL ON FUNCTION public.set_live_tung_price(numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_live_tung_price(numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.get_live_tung_price_usd()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value text;
  v_updated timestamptz;
  v_price numeric;
BEGIN
  SELECT value, updated_at INTO v_value, v_updated
  FROM game_settings
  WHERE key = 'tung_price_usd';

  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_updated IS NULL OR v_updated < now() - interval '60 minutes' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_price := v_value::numeric;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN NULL;
  END IF;

  RETURN v_price;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_tung_price_usd() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_tung_price_usd() TO anon;

-- Now that public.set_live_tung_price exists, populate immediately.
SELECT public.refresh_tung_price();
