CREATE OR REPLACE FUNCTION public.get_market_buy_offers_public()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) - 'buyer_id' ORDER BY x.created_at DESC)
    FROM (
      SELECT o.id, o.buyer_id, o.listing_type, o.item_code, o.quantity, o.quantity_filled,
             o.price_per_unit, o.total_price, o.status, o.created_at, o.updated_at,
             (o.buyer_id = v_uid) AS is_mine,
             s.is_plus AS buyer_is_plus,
             dense_rank() OVER (ORDER BY s.is_plus DESC, COALESCE(NULLIF(pr.rank_position, 0), 2147483647)) AS priority
      FROM public.market_buy_offers o
      JOIN public.profiles pr ON pr.id = o.buyer_id
      CROSS JOIN LATERAL (
        SELECT EXISTS (SELECT 1 FROM public.plus_subscriptions ps
                       WHERE ps.user_id = o.buyer_id AND ps.is_active AND ps.expires_at > now()) AS is_plus
      ) s
      WHERE o.status = 'active'
    ) x
  ), '[]'::jsonb);
END
$function$

