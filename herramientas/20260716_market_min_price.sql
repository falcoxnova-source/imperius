-- ============================================================================
-- get_market_price_reference: precio de referencia del mercado por item.
-- Promedio SIMPLE de las ofertas ACTIVAS de OTROS vendedores para ese item,
-- mas un piso absoluto anti-volcado. min_price = 20% por debajo del promedio
-- (nunca por debajo del piso absoluto). Idempotente (CREATE OR REPLACE).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_market_price_reference(p_listing_type text, p_item_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_avg numeric;
  v_count int;
  v_floor numeric;
  v_min numeric;
  v_suggested numeric;
BEGIN
  -- Promedio simple de ofertas ACTIVAS de OTROS vendedores para este item.
  SELECT AVG(price_per_unit), COUNT(*)
    INTO v_avg, v_count
  FROM market_listings
  WHERE status = 'active'
    AND listing_type = p_listing_type
    AND item_code = p_item_code
    AND (v_uid IS NULL OR seller_id <> v_uid);

  -- Piso absoluto anti-volcado.
  IF p_listing_type = 'resource' THEN
    SELECT CASE p_item_code
             WHEN 'metal' THEN min_price_metal
             WHEN 'crystal' THEN min_price_crystal
             WHEN 'deuterium' THEN min_price_deuterium
             ELSE 0.001 END
      INTO v_floor
    FROM market_resource_limits WHERE id = 1;
  END IF;
  v_floor := COALESCE(v_floor, 0.001);

  IF v_avg IS NULL OR COALESCE(v_count, 0) = 0 THEN
    -- Sin referencia de mercado: solo aplica el piso absoluto.
    v_min := v_floor;
    v_suggested := v_floor;
  ELSE
    v_min := GREATEST(v_floor, ROUND(v_avg * 0.8, 8));
    v_suggested := GREATEST(v_min, ROUND(v_avg, 8));
  END IF;

  RETURN jsonb_build_object(
    'reference_avg', CASE WHEN v_avg IS NULL THEN NULL ELSE ROUND(v_avg, 8) END,
    'sample_count', COALESCE(v_count, 0),
    'absolute_floor', v_floor,
    'min_price', v_min,
    'suggested_price', v_suggested
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_market_price_reference(text, text) TO authenticated, anon;
