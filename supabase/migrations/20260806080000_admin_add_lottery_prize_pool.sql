-- ============================================================================
-- Loteria: el admin puede inyectar TUNG al pozo de premios del sorteo activo
-- ----------------------------------------------------------------------------
-- Los TUNG se DESCUENTAN del saldo del propio admin (no se crean tokens de la
-- nada) y se suman a lottery_draws.prize_pool del sorteo abierto.
--
-- execute_lottery_draw ya calcula:
--     v_total_jackpot := accumulated_jackpot + prize_pool
-- por lo que sumar aqui aumenta el pozo repartible SIN tocar ninguna formula
-- de reparto existente.
--
-- NO se toca total_pool (representa lo recaudado por venta de tickets) para
-- que la contabilidad de tickets siga cuadrando.
-- ============================================================================
SET client_encoding TO 'UTF8';

CREATE OR REPLACE FUNCTION public.admin_add_lottery_prize_pool(p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean;
  v_balance numeric;
  v_draw record;
BEGIN
  v_admin_id := auth.uid();

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La cantidad debe ser mayor que 0');
  END IF;

  -- Mismo orden de bloqueo que buy_lottery_ticket (draw -> profile): sin deadlocks
  SELECT * INTO v_draw FROM lottery_draws
  WHERE status = 'open'
  ORDER BY closes_at ASC LIMIT 1
  FOR UPDATE;

  IF v_draw.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay sorteo activo al que anadir tokens');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance
  FROM profiles WHERE id = v_admin_id
  FOR UPDATE;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Saldo insuficiente. Necesitas ' || p_amount || ' TUNG y tienes ' || FLOOR(v_balance)
    );
  END IF;

  -- Cobro al admin (mismo patron que buy_lottery_ticket: contexto anti-cheat)
  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - p_amount WHERE id = v_admin_id;

  UPDATE lottery_draws
  SET prize_pool = COALESCE(prize_pool, 0) + p_amount
  WHERE id = v_draw.id
  RETURNING * INTO v_draw;

  RETURN jsonb_build_object(
    'success', true,
    'added', p_amount,
    'draw_number', v_draw.draw_number,
    'prize_pool', v_draw.prize_pool,
    'accumulated_jackpot', v_draw.accumulated_jackpot,
    'total_pot', COALESCE(v_draw.prize_pool, 0) + COALESCE(v_draw.accumulated_jackpot, 0),
    'admin_balance', v_balance - p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_lottery_prize_pool(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_add_lottery_prize_pool(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_add_lottery_prize_pool(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
