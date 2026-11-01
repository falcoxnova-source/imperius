/*
  # Fix Plus FXU Prices Conversion

  1. Changes
    - Update Plus plan FXU prices to match USDT conversion rate
    - Rate: 1 USDT = 10,000 FXU (0.0001 USDT per FXU)
    - Plus Mensual: 10 USDT = 100,000 FXU
    - Plus Semestral: 50 USDT = 500,000 FXU
    - Plus Anual: 80 USDT = 800,000 FXU (descuento)

  2. Notes
    - Commission percentages are now for informational purposes only
    - Distribution is equal shares among all Plus subscribers
*/

UPDATE plus_plans SET 
  price_fxu = 100000
WHERE code = 'plus_monthly';

UPDATE plus_plans SET 
  price_fxu = 500000
WHERE code = 'plus_6months';

UPDATE plus_plans SET 
  price_fxu = 800000
WHERE code = 'plus_annual';
