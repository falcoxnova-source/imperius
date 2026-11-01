CREATE OR REPLACE FUNCTION public.get_live_tung_price_usd()
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_value   text;
  v_updated timestamptz;
  v_price   numeric;
BEGIN
  SELECT value, updated_at INTO v_value, v_updated
  FROM game_settings
  WHERE key = 'tung_price_usd';

  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  -- Ventana de tolerancia: 12 horas.
  -- Mejor un precio de hace unas horas que dejar el juego sin precios.
  IF v_updated IS NULL OR v_updated < now() - interval '12 hours' THEN
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
$function$

