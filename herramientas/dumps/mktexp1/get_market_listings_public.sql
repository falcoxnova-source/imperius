CREATE OR REPLACE FUNCTION public.get_market_listings_public(p_listing_type text DEFAULT NULL::text)
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
    SELECT jsonb_agg(to_jsonb(x) - 'seller_id' ORDER BY x.created_at DESC)
    FROM (
      SELECT l.id, l.seller_id, l.listing_type, l.item_code, l.quantity, l.price_per_unit, l.total_price,
             CASE WHEN l.listing_type = 'colony' THEN l.planet_id END AS planet_id,
             l.status, l.created_at, l.updated_at, l.purchasable_at,
             (l.seller_id = v_uid) AS is_mine,
             s.is_plus AS seller_is_plus,
             public.get_market_fee_for_user(l.seller_id) AS seller_fee_percent,
             dense_rank() OVER (ORDER BY s.is_plus DESC, COALESCE(NULLIF(pr.rank_position, 0), 2147483647)) AS priority
      FROM public.market_listings l
      JOIN public.profiles pr ON pr.id = l.seller_id
      CROSS JOIN LATERAL (
        SELECT EXISTS (SELECT 1 FROM public.plus_subscriptions ps
                       WHERE ps.user_id = l.seller_id AND ps.is_active AND ps.expires_at > now()) AS is_plus
      ) s
      WHERE l.status = 'active'
        AND (p_listing_type IS NULL OR l.listing_type = p_listing_type)
    ) x
  ), '[]'::jsonb);
END
$function$

