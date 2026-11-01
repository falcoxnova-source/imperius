-- ============================================================
-- Fix: Expeditions are FREE, limited only by Astrophysics level
-- 
-- Problem: Frontend still shows FXU fee warnings for extra expeditions
--          even though the backend no longer charges.
-- Fix: Force expedition_extra_fee_fxu to 0 and update get_expedition_extra_fee
--      to always return 0.
-- ============================================================

-- 1. Force the game setting to 0
UPDATE game_settings SET value = '0' WHERE key = 'expedition_extra_fee_fxu';

-- 2. Make get_expedition_extra_fee always return 0 (no fee ever)
CREATE OR REPLACE FUNCTION get_expedition_extra_fee()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN 0;
END;
$$;
