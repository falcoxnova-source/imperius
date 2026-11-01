-- =============================================================================
-- LOTERIA: precios anclados a USD, cobrados en TUNG al precio vivo del mercado
-- =============================================================================
--
-- ## Que cambia
-- El ticket y los premios fijos (3 y 2 aciertos) dejan de ser una cantidad
-- fija de TUNG y pasan a ser un valor en USD. La cantidad de TUNG se calcula
-- en el momento usando `get_live_tung_price_usd()`:
--     TUNG = ceil(USD / precio_tung_usd)
-- Si TUNG sube, el ticket cuesta MENOS TUNG. Si TUNG baja, cuesta MAS TUNG.
-- El valor real (poder adquisitivo) se mantiene estable.
--
-- ## Patron reutilizado (NO se inventa nada)
-- Es exactamente el mismo patron que ya usan 26 funciones del juego
-- (activate_daily_streak, purchase_plus_subscription, purchase_supply_box,
--  get_rename_costs, calculate_fxu_cost_*, etc.).
--
-- ## Anti-duplicacion
-- La conversion vive en UNA sola funcion: `public.lottery_price_tung()`.
-- buy_lottery_ticket, get_lottery_info y execute_lottery_draw la llaman.
-- Es imposible que diverjan entre si.
--
-- ## Compatible hacia atras (opt-in)
-- Si el setting `*_usd` esta vacio, en 0, o si el precio del DEX esta caido /
-- obsoleto (>60 min), se usa AUTOMATICAMENTE el valor fijo en TUNG de siempre.
-- Cero riesgo de que la loteria se rompa si el oraculo falla.
--
-- ## Lo que NO se toca
-- - El bote acumulado (jackpot) sigue en TUNG: es dinero ya recaudado.
-- - El descuento VIP -50% se aplica DESPUES de convertir (misma logica).
-- - El reparto 70/20/10 y el tope de premios menores: intactos.
-- =============================================================================

SET client_encoding TO 'UTF8';

-- -----------------------------------------------------------------------------
-- 1) Helper unico de conversion USD -> TUNG para la loteria
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lottery_price_tung(
  p_usd_key  text,
  p_tung_key text,
  p_default  integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_usd   numeric;
  v_price numeric;
  v_tung  integer;
BEGIN
  -- Precio en USD (modo dinamico). Si no existe o es 0 -> modo TUNG fijo.
  SELECT NULLIF(value, '')::numeric INTO v_usd
  FROM game_settings WHERE key = p_usd_key;

  v_price := get_live_tung_price_usd();

  IF v_usd IS NOT NULL AND v_usd > 0 AND v_price IS NOT NULL AND v_price > 0 THEN
    RETURN GREATEST(1, CEIL(v_usd / v_price))::integer;
  END IF;

  -- Fallback: valor fijo en TUNG de toda la vida
  SELECT NULLIF(value, '')::integer INTO v_tung
  FROM game_settings WHERE key = p_tung_key;

  IF v_tung IS NULL OR v_tung < 0 THEN
    v_tung := p_default;
  END IF;
  RETURN v_tung;

EXCEPTION WHEN OTHERS THEN
  -- Valor corrupto en game_settings: nunca dejar la loteria sin precio
  RETURN p_default;
END;
$fn$;

REVOKE ALL ON FUNCTION public.lottery_price_tung(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lottery_price_tung(text, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.lottery_price_tung(text, text, integer) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 2) buy_lottery_ticket: unica linea cambiada = como se obtiene v_ticket_cost
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buy_lottery_ticket(p_numbers integer[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user_id uuid;
  v_draw record;
  v_ticket_cost integer;
  v_max_tickets integer;
  v_user_ticket_count integer;
  v_user_fxu numeric;
  v_is_plus boolean;
  v_final_cost integer;
  v_prize_pct integer;
  v_admin_pct integer;
  v_pool_pct integer;
  v_prize_amount numeric;
  v_admin_amount numeric;
  v_pool_amount numeric;
  v_admin_id uuid;
  v_ticket_id uuid;
  v_num integer;
  v_sorted integer[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Validate numbers: exactly 4, all between 1-30, no duplicates
  IF array_length(p_numbers, 1) != 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes elegir exactamente 4 números');
  END IF;

  FOREACH v_num IN ARRAY p_numbers LOOP
    IF v_num < 1 OR v_num > 30 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Los números deben estar entre 1 y 30');
    END IF;
  END LOOP;

  -- Check duplicates within the 4 numbers
  SELECT ARRAY(SELECT DISTINCT unnest(p_numbers) ORDER BY 1) INTO v_sorted;
  IF array_length(v_sorted, 1) != 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes repetir números');
  END IF;
  p_numbers := v_sorted;

  -- Get active draw (FOR UPDATE serializes concurrent purchases)
  SELECT * INTO v_draw FROM lottery_draws
  WHERE status = 'open' AND closes_at > now()
  ORDER BY closes_at ASC LIMIT 1
  FOR UPDATE;

  IF v_draw.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay sorteo activo en este momento');
  END IF;

  -- Get config
  -- >>> CAMBIO: precio anclado a USD (fallback automatico al TUNG fijo)
  v_ticket_cost := lottery_price_tung('lottery_ticket_cost_usd', 'lottery_ticket_cost', 50);
  SELECT COALESCE(value::integer, 10) INTO v_max_tickets FROM game_settings WHERE key = 'lottery_max_tickets';
  SELECT COALESCE(value::integer, 70) INTO v_prize_pct FROM game_settings WHERE key = 'lottery_prize_pool_pct';
  SELECT COALESCE(value::integer, 20) INTO v_admin_pct FROM game_settings WHERE key = 'lottery_admin_pct';
  SELECT COALESCE(value::integer, 10) INTO v_pool_pct FROM game_settings WHERE key = 'lottery_reward_pool_pct';
  IF v_ticket_cost IS NULL THEN v_ticket_cost := 50; END IF;
  IF v_max_tickets IS NULL THEN v_max_tickets := 10; END IF;
  IF v_prize_pct IS NULL THEN v_prize_pct := 70; END IF;
  IF v_admin_pct IS NULL THEN v_admin_pct := 20; END IF;
  IF v_pool_pct IS NULL THEN v_pool_pct := 10; END IF;

  -- Check ticket limit
  SELECT COUNT(*) INTO v_user_ticket_count
  FROM lottery_tickets WHERE draw_id = v_draw.id AND user_id = v_user_id;

  IF v_user_ticket_count >= v_max_tickets THEN
    RETURN jsonb_build_object('success', false, 'error', 'Has alcanzado el límite de ' || v_max_tickets || ' tickets para este sorteo');
  END IF;

  -- Check duplicate combination for same user
  IF EXISTS (
    SELECT 1 FROM lottery_tickets
    WHERE draw_id = v_draw.id AND user_id = v_user_id AND numbers = p_numbers
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un ticket con estos números en este sorteo. Elige una combinación diferente.');
  END IF;

  -- VIP discount
  v_is_plus := is_user_plus(v_user_id);
  v_final_cost := v_ticket_cost;
  IF v_is_plus THEN
    v_final_cost := CEIL(v_ticket_cost * 0.50);
  END IF;

  -- Check balance
  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu FROM profiles WHERE id = v_user_id;
  IF v_user_fxu < v_final_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FXU insuficiente. Necesitas ' || v_final_cost || ' FXU, tienes ' || FLOOR(v_user_fxu) || ' FXU'
    );
  END IF;

  -- Charge user
  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_final_cost WHERE id = v_user_id;

  -- Split revenue
  v_prize_amount := FLOOR(v_final_cost * v_prize_pct / 100.0);
  v_admin_amount := FLOOR(v_final_cost * v_admin_pct / 100.0);
  v_pool_amount := v_final_cost - v_prize_amount - v_admin_amount;

  -- Admin revenue
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id AND v_admin_amount > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_amount WHERE id = v_admin_id;
  END IF;
  PERFORM record_admin_revenue('lottery_fee', v_admin_amount, 'Lottery ticket #' || (v_user_ticket_count + 1) || ' draw #' || v_draw.draw_number, v_user_id, v_draw.id);

  -- Reward pools
  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'lottery', v_user_id);
  END IF;

  -- Create ticket
  INSERT INTO lottery_tickets (draw_id, user_id, numbers, cost)
  VALUES (v_draw.id, v_user_id, p_numbers, v_final_cost)
  RETURNING id INTO v_ticket_id;

  -- Update draw totals
  UPDATE lottery_draws SET
    total_tickets = total_tickets + 1,
    total_pool = total_pool + v_final_cost,
    prize_pool = prize_pool + v_prize_amount,
    admin_revenue = admin_revenue + v_admin_amount,
    reward_pool_share = reward_pool_share + v_pool_amount
  WHERE id = v_draw.id;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'numbers', p_numbers,
    'cost', v_final_cost,
    'draw_number', v_draw.draw_number,
    'tickets_remaining', v_max_tickets - v_user_ticket_count - 1,
    'vip_discount', v_is_plus
  );
END;
$fn$;


-- -----------------------------------------------------------------------------
-- 3) get_lottery_info: mismos precios + info USD para pintar la UI
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_lottery_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user_id uuid;
  v_active_draw record;
  v_user_tickets jsonb;
  v_user_ticket_count integer;
  v_ticket_cost integer;
  v_max_tickets integer;
  v_is_plus boolean;
  v_final_cost integer;
  v_accumulated numeric;
  v_past_draws jsonb;
  v_past_winners jsonb;
  v_enabled boolean;
  v_prize_3match integer;
  v_prize_2match integer;
  v_ticket_usd numeric;
  v_tung_price numeric;
  v_usd_mode boolean;
BEGIN
  v_user_id := auth.uid();

  -- Check if enabled
  SELECT COALESCE(value::boolean, true) INTO v_enabled
  FROM game_settings WHERE key = 'lottery_enabled';
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  -- Get config
  -- >>> CAMBIO: precios anclados a USD (mismo helper que buy_lottery_ticket)
  v_ticket_cost  := lottery_price_tung('lottery_ticket_cost_usd',  'lottery_ticket_cost',  50);
  v_prize_3match := lottery_price_tung('lottery_3match_prize_usd', 'lottery_3match_prize', 500);
  v_prize_2match := lottery_price_tung('lottery_2match_prize_usd', 'lottery_2match_prize', 50);

  SELECT COALESCE(value::integer, 10) INTO v_max_tickets FROM game_settings WHERE key = 'lottery_max_tickets';
  IF v_ticket_cost IS NULL THEN v_ticket_cost := 50; END IF;
  IF v_max_tickets IS NULL THEN v_max_tickets := 10; END IF;

  -- Datos del modo USD (solo informativos para la UI)
  SELECT NULLIF(value, '')::numeric INTO v_ticket_usd
  FROM game_settings WHERE key = 'lottery_ticket_cost_usd';
  v_tung_price := get_live_tung_price_usd();
  v_usd_mode := (v_ticket_usd IS NOT NULL AND v_ticket_usd > 0
                 AND v_tung_price IS NOT NULL AND v_tung_price > 0);

  v_is_plus := is_user_plus(v_user_id);
  v_final_cost := v_ticket_cost;
  IF v_is_plus THEN
    v_final_cost := CEIL(v_ticket_cost * 0.50);
  END IF;

  -- Get active draw
  SELECT * INTO v_active_draw FROM lottery_draws
  WHERE status = 'open'
  ORDER BY closes_at ASC LIMIT 1;

  -- Count user tickets for active draw
  v_user_ticket_count := 0;
  v_user_tickets := '[]'::jsonb;
  IF v_active_draw.id IS NOT NULL AND v_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_ticket_count
    FROM lottery_tickets WHERE draw_id = v_active_draw.id AND user_id = v_user_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'numbers', numbers, 'cost', cost, 'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_user_tickets
    FROM lottery_tickets WHERE draw_id = v_active_draw.id AND user_id = v_user_id;
  END IF;

  -- Calculate accumulated jackpot
  v_accumulated := COALESCE(v_active_draw.accumulated_jackpot, 0) + COALESCE(v_active_draw.prize_pool, 0);

  -- Past draws (last 10)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'draw_number', d.draw_number,
    'winning_numbers', d.winning_numbers,
    'total_tickets', d.total_tickets,
    'jackpot_amount', d.jackpot_amount,
    'jackpot_winner', CASE WHEN d.jackpot_winner_id IS NOT NULL THEN (
      SELECT username FROM profiles WHERE id = d.jackpot_winner_id
    ) ELSE NULL END,
    'drawn_at', d.drawn_at,
    'total_pool', d.total_pool
  ) ORDER BY d.drawn_at DESC), '[]'::jsonb)
  INTO v_past_draws
  FROM (SELECT * FROM lottery_draws WHERE status = 'completed' ORDER BY drawn_at DESC LIMIT 10) d;

  -- Recent winners (last 20)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'username', sub.username,
    'matches', sub.matches,
    'prize', sub.prize,
    'numbers', sub.numbers,
    'winning_numbers', sub.winning_numbers,
    'created_at', sub.created_at
  ) ORDER BY sub.created_at DESC), '[]'::jsonb)
  INTO v_past_winners
  FROM (
    SELECT w.matches, w.prize, w.numbers, w.winning_numbers, w.created_at, p.username
    FROM lottery_winners w JOIN profiles p ON p.id = w.user_id
    ORDER BY w.created_at DESC LIMIT 20
  ) sub;

  RETURN jsonb_build_object(
    'enabled', true,
    'active_draw', CASE WHEN v_active_draw.id IS NOT NULL THEN jsonb_build_object(
      'id', v_active_draw.id,
      'draw_number', v_active_draw.draw_number,
      'status', v_active_draw.status,
      'total_tickets', v_active_draw.total_tickets,
      'prize_pool', v_accumulated,
      'accumulated_jackpot', v_active_draw.accumulated_jackpot,
      'opens_at', v_active_draw.opens_at,
      'closes_at', v_active_draw.closes_at
    ) ELSE NULL END,
    'can_buy_tickets', CASE WHEN v_active_draw.id IS NOT NULL AND v_active_draw.closes_at > now() THEN true ELSE false END,
    'ticket_cost', v_ticket_cost,
    'ticket_cost_vip', CEIL(v_ticket_cost * 0.50),
    'final_cost', v_final_cost,
    'is_vip', v_is_plus,
    'max_tickets', v_max_tickets,
    'user_tickets', v_user_tickets,
    'user_ticket_count', v_user_ticket_count,
    'past_draws', v_past_draws,
    'past_winners', v_past_winners,
    'prize_3match', v_prize_3match,
    'prize_2match', v_prize_2match,
    -- >>> NUEVO: contexto de precio para la UI
    'usd_mode', v_usd_mode,
    'ticket_cost_usd', v_ticket_usd,
    'tung_price_usd', v_tung_price
  );
END;
$fn$;


-- -----------------------------------------------------------------------------
-- 4) admin_update_lottery_settings: 3 parametros nuevos (USD), opcionales
--    Se hace DROP + CREATE porque cambia la firma (evita overloads ambiguos).
--    Los 8 parametros originales conservan nombre, tipo y orden -> el panel
--    admin actual sigue funcionando sin cambios.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_update_lottery_settings(integer, integer, integer, integer, integer, integer, integer, boolean);

CREATE FUNCTION public.admin_update_lottery_settings(
  p_ticket_cost      integer DEFAULT NULL,
  p_max_tickets      integer DEFAULT NULL,
  p_prize_pool_pct   integer DEFAULT NULL,
  p_admin_pct        integer DEFAULT NULL,
  p_reward_pool_pct  integer DEFAULT NULL,
  p_prize_3match     integer DEFAULT NULL,
  p_prize_2match     integer DEFAULT NULL,
  p_enabled          boolean DEFAULT NULL,
  p_ticket_cost_usd  numeric DEFAULT NULL,
  p_prize_3match_usd numeric DEFAULT NULL,
  p_prize_2match_usd numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  IF p_ticket_cost IS NOT NULL AND p_ticket_cost > 0 THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_ticket_cost', p_ticket_cost::text, 'Costo ticket lotería (TUNG fijo, fallback)')
    ON CONFLICT (key) DO UPDATE SET value = p_ticket_cost::text;
  END IF;

  IF p_max_tickets IS NOT NULL AND p_max_tickets > 0 THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_max_tickets', p_max_tickets::text, 'Max tickets por sorteo')
    ON CONFLICT (key) DO UPDATE SET value = p_max_tickets::text;
  END IF;

  IF p_prize_pool_pct IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_prize_pool_pct', p_prize_pool_pct::text, '% pozo premios')
    ON CONFLICT (key) DO UPDATE SET value = p_prize_pool_pct::text;
  END IF;

  IF p_admin_pct IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_admin_pct', p_admin_pct::text, '% admin')
    ON CONFLICT (key) DO UPDATE SET value = p_admin_pct::text;
  END IF;

  IF p_reward_pool_pct IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_reward_pool_pct', p_reward_pool_pct::text, '% pools recompensa')
    ON CONFLICT (key) DO UPDATE SET value = p_reward_pool_pct::text;
  END IF;

  IF p_prize_3match IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_3match_prize', p_prize_3match::text, 'Premio 3 aciertos (TUNG fijo, fallback)')
    ON CONFLICT (key) DO UPDATE SET value = p_prize_3match::text;
  END IF;

  IF p_prize_2match IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_2match_prize', p_prize_2match::text, 'Premio 2 aciertos (TUNG fijo, fallback)')
    ON CONFLICT (key) DO UPDATE SET value = p_prize_2match::text;
  END IF;

  IF p_enabled IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_enabled', p_enabled::text, 'Lotería habilitada')
    ON CONFLICT (key) DO UPDATE SET value = p_enabled::text;
  END IF;

  -- >>> NUEVO: precios en USD. Un 0 (o negativo) APAGA el modo USD y
  --     devuelve la loteria al precio fijo en TUNG.
  IF p_ticket_cost_usd IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_ticket_cost_usd', GREATEST(p_ticket_cost_usd, 0)::text, 'Costo ticket lotería en USD (0 = usar TUNG fijo)')
    ON CONFLICT (key) DO UPDATE SET value = GREATEST(p_ticket_cost_usd, 0)::text;
  END IF;

  IF p_prize_3match_usd IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_3match_prize_usd', GREATEST(p_prize_3match_usd, 0)::text, 'Premio 3 aciertos en USD (0 = usar TUNG fijo)')
    ON CONFLICT (key) DO UPDATE SET value = GREATEST(p_prize_3match_usd, 0)::text;
  END IF;

  IF p_prize_2match_usd IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_2match_prize_usd', GREATEST(p_prize_2match_usd, 0)::text, 'Premio 2 aciertos en USD (0 = usar TUNG fijo)')
    ON CONFLICT (key) DO UPDATE SET value = GREATEST(p_prize_2match_usd, 0)::text;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_update_lottery_settings(
  integer, integer, integer, integer, integer, integer, integer, boolean, numeric, numeric, numeric
) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 5) Semillas: activar el modo USD
--    0.025 USD ticket / 0.25 USD premio 3 aciertos / 0.025 USD premio 2 aciertos
--    Los valores fijos en TUNG se conservan intactos como red de seguridad.
-- -----------------------------------------------------------------------------
INSERT INTO game_settings (key, value, description) VALUES
  ('lottery_ticket_cost_usd',  '0.025', 'Costo ticket lotería en USD (0 = usar TUNG fijo)'),
  ('lottery_3match_prize_usd', '0.25',  'Premio 3 aciertos en USD (0 = usar TUNG fijo)'),
  ('lottery_2match_prize_usd', '0.025', 'Premio 2 aciertos en USD (0 = usar TUNG fijo)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

NOTIFY pgrst, 'reload schema';
