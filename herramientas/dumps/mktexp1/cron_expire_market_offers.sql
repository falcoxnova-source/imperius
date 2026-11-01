CREATE OR REPLACE FUNCTION public.cron_expire_market_offers()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sell integer := 0;
  v_buy  integer := 0;
BEGIN
  v_sell := public.expire_old_market_listings();
  v_buy  := public.expire_old_market_buy_offers();
  RETURN 'ventas=' || v_sell || ' compras=' || v_buy;
END;
$function$

