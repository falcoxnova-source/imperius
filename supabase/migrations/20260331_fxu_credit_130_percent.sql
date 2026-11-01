-- ============================================================
-- FXU Credit Boost: 130% instead of 100%
-- 
-- When users spend FXU on company services (VIP, officers, 
-- instant completions, supply boxes), they now receive 130% 
-- credit instead of 100%.
-- Example: Spend 100 FXU → Get 130 FXU credit
-- ============================================================

-- Update calculate_running_fxu_credit to apply 1.3x multiplier on spending
CREATE OR REPLACE FUNCTION public.calculate_running_fxu_credit(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz;
  v_credit numeric := 0;
  v_row RECORD;
  v_credit_multiplier numeric := 1.3; -- 130% credit on company spending
BEGIN
  SELECT earnings_cutoff_date INTO v_cutoff
  FROM market_resource_limits WHERE id = 1;

  FOR v_row IN (
    -- Company spending events (add to credit) — ALL history, NO cutoff
    SELECT created_at, amount as delta, 'SPEND' as event_type
    FROM admin_revenue
    WHERE related_user_id = p_user_id
      AND revenue_type IN (
        'plus_subscription', 'officer_fxu',
        'instant_ship', 'instant_build', 'instant_research', 'supply_box'
      )

    UNION ALL

    -- Market sale events (subtract from credit) — only from cutoff
    SELECT mt.created_at, mt.total_price as delta, 'SALE' as event_type
    FROM market_transactions mt
    JOIN market_listings ml ON ml.id = mt.listing_id
    WHERE mt.seller_id = p_user_id
      AND ml.listing_type IN ('resource', 'ship')
      AND (v_cutoff IS NULL OR mt.created_at >= v_cutoff)

    ORDER BY created_at ASC
  ) LOOP
    IF v_row.event_type = 'SPEND' THEN
      -- Apply 130% credit multiplier on spending
      v_credit := v_credit + (v_row.delta * v_credit_multiplier);
    ELSE
      v_credit := v_credit - v_row.delta;
      IF v_credit < 0 THEN
        v_credit := 0;
      END IF;
    END IF;
  END LOOP;

  RETURN v_credit;
END;
$function$;
