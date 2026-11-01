/*
  # Correccion de Balances de Pools Independientes

  ## Problema:
  - La migracion anterior sincronizo incorrectamente los pools
  - El monthly_balance deberia tener SOLO contribuciones desde la ultima distribucion
  - Cada pool debe ser INDEPENDIENTE

  ## Calculo correcto:
  - Jackpot balance: 2721 FXU
  - Contribuciones despues de ultima distribucion: 648 FXU
  - Antes de 648: 2073 FXU (monthly era 0 por distribucion)
  - 2073 estaba en expedition(20%) y plus(50%) en proporcion 2:5
  - expedition = 2073 * 2/7 = 592
  - plus = 2073 * 5/7 = 1481
  
  Despues de agregar las 648:
  - expedition = 592 + 129 (20% de 648) = 721
  - monthly = 0 + 194 (30% de 648) = 194
  - plus = 1481 + 325 (resto) = 1806
  - Total: 721 + 194 + 1806 = 2721 OK
*/

-- Corregir los balances a los valores correctos
UPDATE jackpot_pools
SET 
  expedition_balance = 721,
  monthly_balance = 194,
  plus_balance = 1806,
  updated_at = now()
WHERE id = 1;

-- Verificar que la suma coincide con el jackpot
DO $$
DECLARE
  v_jackpot_balance numeric;
  v_pools_sum numeric;
BEGIN
  SELECT balance INTO v_jackpot_balance FROM jackpot WHERE id = 1;
  SELECT expedition_balance + monthly_balance + plus_balance INTO v_pools_sum FROM jackpot_pools WHERE id = 1;
  
  IF v_jackpot_balance != v_pools_sum THEN
    RAISE EXCEPTION 'ERROR: jackpot.balance (%) != suma de pools (%)', v_jackpot_balance, v_pools_sum;
  END IF;
  
  RAISE NOTICE 'Verificacion OK: jackpot.balance = % = suma de pools', v_jackpot_balance;
END $$;
