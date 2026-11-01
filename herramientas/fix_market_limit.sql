-- Fix: Add the 7-arg version of admin_update_market_resource_limits (with monthly_limit_enabled)
CREATE OR REPLACE FUNCTION public.admin_update_market_resource_limits(
  p_min_price_metal numeric DEFAULT NULL::numeric,
  p_min_price_crystal numeric DEFAULT NULL::numeric,
  p_min_price_deuterium numeric DEFAULT NULL::numeric,
  p_monthly_limit_metal bigint DEFAULT NULL::bigint,
  p_monthly_limit_crystal bigint DEFAULT NULL::bigint,
  p_monthly_limit_deuterium bigint DEFAULT NULL::bigint,
  p_monthly_limit_enabled boolean DEFAULT NULL::boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  UPDATE market_resource_limits
  SET
    min_price_metal = COALESCE(p_min_price_metal, min_price_metal),
    min_price_crystal = COALESCE(p_min_price_crystal, min_price_crystal),
    min_price_deuterium = COALESCE(p_min_price_deuterium, min_price_deuterium),
    monthly_limit_metal = COALESCE(p_monthly_limit_metal, monthly_limit_metal),
    monthly_limit_crystal = COALESCE(p_monthly_limit_crystal, monthly_limit_crystal),
    monthly_limit_deuterium = COALESCE(p_monthly_limit_deuterium, monthly_limit_deuterium),
    monthly_limit_enabled = COALESCE(p_monthly_limit_enabled, monthly_limit_enabled),
    updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object('success', true);
END;
$$;
