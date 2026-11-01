-- ---------------------------------------------------------------------
-- Fix: la compra del Astillero Corporativo fallaba con 400 porque
-- distribute_spend_fee -> record_admin_revenue inserta en admin_revenue
-- con revenue_type = 'instant_unit_sale', valor no permitido por el CHECK.
-- Cambio aditivo: solo se amplia la lista de valores permitidos.
-- ---------------------------------------------------------------------
BEGIN;

ALTER TABLE public.admin_revenue
  DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;

ALTER TABLE public.admin_revenue
  ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type = ANY (ARRAY[
    'market_fee','withdrawal_fee','instant_build','instant_research','instant_ship',
    'referral_bonus','officer_fxu','expedition_fee','supply_box','fleet_acceleration',
    'swap_fee','transfer_fee','plus_subscription','colony_abandon','planet_rename',
    'alliance_rename','alliance_creation','lottery_fee','p2p_fee','blueprint_sale',
    'hero_respec','hero_kit_sale','other','premium_mission','hero_duel','daily_streak',
    'deposit_gas_buffer','instant_unit_sale'
  ]));

COMMIT;

NOTIFY pgrst, 'reload schema';
