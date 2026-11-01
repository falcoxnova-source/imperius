-- ============================================================================
-- AJUSTE: Planes VIP → 1 mes, 6 meses, 12 meses
-- ============================================================================
-- Antes: Mensual (1mo/$6), Trimestral (3mo/$14), 9 Meses (9mo/$45)
-- Ahora: Mensual (1mo/$6), Semestral (6mo/$30), Anual (12mo/$50)
--
-- La función purchase_plus_subscription lee duration_months de plus_plans
-- dinámicamente, así que solo hay que actualizar las filas.
-- ============================================================================

-- Plan 1: Mensual (sin cambios)
UPDATE plus_plans SET 
  name = 'VIP Mensual',
  duration_months = 1,
  price_usdt = 6,
  price_fxu = 60000
WHERE code = 'plus_monthly';

-- Plan 2: Semestral (era Trimestral 3mo/$14, ahora 6mo/$30)
UPDATE plus_plans SET 
  name = 'VIP Semestral',
  duration_months = 6,
  price_usdt = 30,
  price_fxu = 300000
WHERE code = 'plus_6months';

-- Plan 3: Anual (era 9 Meses 9mo/$45, ahora 12mo/$50)
UPDATE plus_plans SET 
  name = 'VIP Anual',
  duration_months = 12,
  price_usdt = 50,
  price_fxu = 500000
WHERE code = 'plus_annual';
