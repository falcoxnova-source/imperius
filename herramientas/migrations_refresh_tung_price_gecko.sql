CREATE OR REPLACE FUNCTION public.refresh_tung_price_from_dex()
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_content    text;
  v_resp       jsonb;
  v_price      numeric;
  v_liq        numeric;
  v_last       numeric;
  v_last_age   numeric;
  v_deviation  numeric;
  v_source     text := 'dexscreener';
  v_dex_err    text;
BEGIN
  -- Precio actual guardado (para el freno anti-salto)
  SELECT value::numeric, EXTRACT(EPOCH FROM (now() - updated_at)) / 60
    INTO v_last, v_last_age
  FROM game_settings
  WHERE key = 'tung_price_usd';

  -- 1) DexScreener
  BEGIN
    SELECT content INTO v_content
    FROM extensions.http_get('https://api.dexscreener.com/latest/dex/tokens/0x09514EcF8270C12101D077B5e8B034B164F71C5f');
    v_resp := NULLIF(v_content, '')::jsonb;
    IF v_resp IS NOT NULL AND jsonb_typeof(v_resp->'pairs') = 'array'
       AND jsonb_array_length(v_resp->'pairs') > 0 THEN
      -- Par con mayor liquidez USD (el mas fiable)
      SELECT (pair->>'priceUsd')::numeric,
             COALESCE((pair->'liquidity'->>'usd')::numeric, 0)
        INTO v_price, v_liq
      FROM jsonb_array_elements(v_resp->'pairs') AS pair
      WHERE pair->>'priceUsd' IS NOT NULL
      ORDER BY COALESCE((pair->'liquidity'->>'usd')::numeric, 0) DESC
      LIMIT 1;
    ELSE
      v_dex_err := 'sin pares';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_price := NULL;
    v_dex_err := SQLERRM;
  END;

  -- 2) Respaldo: GeckoTerminal (DexScreener dejo de indexar TUNG)
  IF v_price IS NULL OR v_price <= 0 THEN
    v_source := 'geckoterminal';
    v_price := NULL;
    v_liq := NULL;
    BEGIN
      SELECT content INTO v_content
      FROM extensions.http((
        'GET',
        'https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0x09514ecf8270c12101d077b5e8b034b164f71c5f',
        ARRAY[extensions.http_header('User-Agent', 'Mozilla/5.0'),
              extensions.http_header('Accept', 'application/json')],
        NULL, NULL
      )::extensions.http_request);
      v_resp := NULLIF(v_content, '')::jsonb;
      v_price := NULLIF(v_resp->'data'->'attributes'->>'price_usd', '')::numeric;
      v_liq := COALESCE(NULLIF(v_resp->'data'->'attributes'->>'total_reserve_in_usd', '')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      v_price := NULL;
      INSERT INTO tung_price_history (price_usd, accepted, reason)
      VALUES (NULL, false, 'sin precio: dexscreener (' || COALESCE(v_dex_err, '?') || ') y geckoterminal fallo: ' || SQLERRM);
      RETURN NULL;
    END;
  END IF;

  IF v_price IS NULL OR v_price <= 0 THEN
    INSERT INTO tung_price_history (price_usd, liquidity, accepted, reason)
    VALUES (v_price, v_liq, false, 'precio nulo o <= 0 (' || v_source || ')');
    RETURN NULL;
  END IF;

  -- Rechazar pares sin liquidez real (dan precios basura)
  IF v_liq < 200 THEN
    INSERT INTO tung_price_history (price_usd, liquidity, accepted, reason)
    VALUES (v_price, v_liq, false, 'liquidez insuficiente (' || v_source || ')');
    RETURN NULL;
  END IF;

  -- FRENO ANTI-SALTO: si el precio salta mas de 40% respecto al ultimo
  -- valor bueno y ese valor tiene menos de 30 min, se ignora este tick.
  -- Si el movimiento es real, tras 30 min el freno se abre solo.
  IF v_last IS NOT NULL AND v_last > 0 AND v_last_age < 30 THEN
    v_deviation := abs(v_price - v_last) / v_last;
    IF v_deviation > 0.40 THEN
      INSERT INTO tung_price_history (price_usd, liquidity, accepted, reason)
      VALUES (v_price, v_liq, false,
              format('salto anormal %s%% vs %s (freno activo, %s)',
                     round(v_deviation * 100, 1), v_last, v_source));
      RETURN NULL;
    END IF;
  END IF;

  PERFORM set_live_tung_price(v_price);

  INSERT INTO tung_price_history (price_usd, liquidity, accepted, reason)
  VALUES (v_price, v_liq, true, 'ok (' || v_source || ')');

  RETURN v_price;
EXCEPTION WHEN OTHERS THEN
  -- Nunca falla: se conserva el ultimo precio bueno
  BEGIN
    INSERT INTO tung_price_history (price_usd, accepted, reason)
    VALUES (NULL, false, 'error inesperado: ' || SQLERRM);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END;
$function$;
