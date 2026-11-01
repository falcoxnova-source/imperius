/*
  # Corregir Distribucion de Pools del Jackpot

  ## Problema:
  - Existian dos versiones de contribute_to_jackpot con diferentes firmas
  - La version que se llamaba (amount, source, user_id) NO distribuia a los pools
  - El monthly_balance (30%) no estaba recibiendo contribuciones

  ## Solucion:
  1. Eliminar ambas versiones conflictivas
  2. Crear una unica version que distribuya correctamente a los 3 pools
  3. Usar firma (amount, source, user_id) para compatibilidad con llamadas existentes
*/

-- Eliminar las versiones conflictivas
DROP FUNCTION IF EXISTS contribute_to_jackpot(numeric, text, uuid);
DROP FUNCTION IF EXISTS contribute_to_jackpot(uuid, numeric, text);

-- Crear version unica que distribuye a todos los pools
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

  IF v_expedition_percent IS NULL THEN
    v_expedition_percent := 20;
    v_monthly_percent := 30;
    v_plus_percent := 50;
  END IF;

  v_expedition_amount := FLOOR(p_amount * v_expedition_percent / 100);
  v_monthly_amount := FLOOR(p_amount * v_monthly_percent / 100);
  v_plus_amount := p_amount - v_expedition_amount - v_monthly_amount;

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

GRANT EXECUTE ON FUNCTION contribute_to_jackpot(numeric, text, uuid) TO authenticated;

-- Sincronizar los balances de los pools basado en el balance total del jackpot
-- Calcular cuanto deberia tener cada pool segun los porcentajes
DO $$
DECLARE
  v_total_balance numeric;
  v_expedition_percent int;
  v_monthly_percent int;
  v_plus_percent int;
  v_expedition_balance numeric;
  v_monthly_balance numeric;
  v_plus_balance numeric;
  v_current_expedition numeric;
  v_current_monthly numeric;
  v_current_plus numeric;
BEGIN
  SELECT balance INTO v_total_balance FROM jackpot WHERE id = 1;
  
  SELECT expedition_percent, monthly_percent, plus_percent,
         expedition_balance, monthly_balance, plus_balance
  INTO v_expedition_percent, v_monthly_percent, v_plus_percent,
       v_current_expedition, v_current_monthly, v_current_plus
  FROM jackpot_pools WHERE id = 1;
  
  v_expedition_balance := FLOOR(v_total_balance * v_expedition_percent / 100);
  v_monthly_balance := FLOOR(v_total_balance * v_monthly_percent / 100);
  v_plus_balance := v_total_balance - v_expedition_balance - v_monthly_balance;
  
  UPDATE jackpot_pools
  SET 
    expedition_balance = v_expedition_balance,
    monthly_balance = v_monthly_balance,
    plus_balance = v_plus_balance,
    updated_at = now()
  WHERE id = 1;
  
  RAISE NOTICE 'Pools sincronizados - Total: %, Expedition (20%%): %, Monthly (30%%): %, Plus (50%%): %',
    v_total_balance, v_expedition_balance, v_monthly_balance, v_plus_balance;
END $$;
