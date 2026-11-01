/*
  # Ajustar porcentajes de pools del jackpot

  ## Cambios:
  - Expediciones: 20% (sin cambios)
  - Top 50: 30% → 20%
  - Ranking Social: 30% → 20%
  - Reserva: 20% → 40%

  ## Importante:
  - Los balances actuales de cada pool NO se tocan
  - Solo afecta las contribuciones FUTURAS
  - El dinero ya acumulado sigue donde está
*/

-- 1. Actualizar porcentajes en la tabla
UPDATE jackpot_pools
SET 
  monthly_percent = 20,
  plus_percent = 20,
  updated_at = now()
WHERE id = 1;

-- 2. Actualizar función contribute_to_jackpot con nuevos defaults
CREATE OR REPLACE FUNCTION contribute_to_jackpot(
  p_amount numeric, 
  p_source text, 
  p_user_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expedition_amount numeric;
  v_monthly_amount numeric;
  v_plus_amount numeric;
  v_expedition_percent int;
  v_monthly_percent int;
  v_plus_percent int;
  v_new_total numeric;
BEGIN
  IF p_amount <= 0 THEN
    RETURN 0;
  END IF;

  SELECT expedition_percent, monthly_percent, plus_percent
  INTO v_expedition_percent, v_monthly_percent, v_plus_percent
  FROM jackpot_pools WHERE id = 1;

  -- Fallback defaults: 20% expedition, 20% monthly, 20% social, 40% reserve
  IF v_expedition_percent IS NULL THEN
    v_expedition_percent := 20;
    v_monthly_percent := 20;
    v_plus_percent := 20;
  END IF;

  v_expedition_amount := FLOOR(p_amount * v_expedition_percent / 100);
  v_monthly_amount := FLOOR(p_amount * v_monthly_percent / 100);
  v_plus_amount := FLOOR(p_amount * v_plus_percent / 100);
  -- Remaining 40% stays as reserve in jackpot.balance (not allocated to any pool)

  UPDATE jackpot_pools
  SET 
    expedition_balance = expedition_balance + v_expedition_amount,
    expedition_total = expedition_total + v_expedition_amount,
    monthly_balance = monthly_balance + v_monthly_amount,
    monthly_total = monthly_total + v_monthly_amount,
    plus_balance = plus_balance + v_plus_amount,
    plus_total = plus_total + v_plus_amount,
    updated_at = now()
  WHERE id = 1;

  UPDATE jackpot
  SET 
    balance = balance + p_amount,
    total_contributed = total_contributed + p_amount,
    updated_at = now()
  WHERE id = 1;

  SELECT expedition_balance + monthly_balance + plus_balance 
  INTO v_new_total
  FROM jackpot_pools WHERE id = 1;

  INSERT INTO jackpot_history (user_id, type, amount, source, jackpot_balance_after)
  VALUES (p_user_id, 'contribution', p_amount, p_source, v_new_total);

  RETURN v_new_total;
END;
$$;
