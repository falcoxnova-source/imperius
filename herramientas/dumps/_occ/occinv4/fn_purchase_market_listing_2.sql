CREATE OR REPLACE FUNCTION public.purchase_market_listing(p_listing_id uuid, p_buyer_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Redirige al flujo canonico y robusto (verifica stock del vendedor,
  -- descuenta al vendedor, entrega al comprador; todo atomico).
  RETURN public.purchase_market_listing(p_listing_id, NULL::integer, p_buyer_planet_id);
END;
$function$

