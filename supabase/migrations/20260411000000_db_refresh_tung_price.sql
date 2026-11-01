-- =====================================================================
-- TUNG live price fetched server-side by the database (no edge functions)
-- Uses http + pg_cron extensions already installed on the VPS.
-- Reuses existing set_live_tung_price / get_live_tung_price_usd.
-- =====================================================================

-- Fetch TUNG price from DexScreener and persist into game_settings.
CREATE OR REPLACE FUNCTION public.refresh_tung_price()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_status int;
  v_resp   jsonb;
  v_price  numeric;
BEGIN
  -- 8s timeout so a slow API never hangs the cron worker
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  SELECT status, (content)::jsonb
    INTO v_status, v_resp
  FROM extensions.http_get(
    'https://api.dexscreener.com/latest/dex/tokens/0x09514EcF8270C12101D077B5e8B034B164F71C5f'
  );

  IF v_status <> 200 OR v_resp IS NULL THEN
    RETURN NULL;
  END IF;

  -- Pick the pair with the highest USD liquidity (resistant to thin-pool manipulation)
  SELECT (pair->>'priceUsd')::numeric
    INTO v_price
  FROM jsonb_array_elements(v_resp->'pairs') AS pair
  WHERE pair->>'priceUsd' IS NOT NULL
  ORDER BY COALESCE((pair->'liquidity'->>'usd')::numeric, 0) DESC
  LIMIT 1;

  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.set_live_tung_price(v_price);
  RETURN v_price;
EXCEPTION WHEN OTHERS THEN
  -- Never break the cron run; keep last known price
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_tung_price() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_tung_price() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_tung_price() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_tung_price() TO service_role;

-- Schedule a refresh every minute (idempotent: drop old job first)
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-tung-price') THEN
    PERFORM cron.unschedule('refresh-tung-price');
  END IF;
  PERFORM cron.schedule('refresh-tung-price', '* * * * *', 'SELECT public.refresh_tung_price();');
END;
$cron$;

-- Populate immediately so the price is available right away
SELECT public.refresh_tung_price();
