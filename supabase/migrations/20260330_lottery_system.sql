-- =====================================================
-- MIGRACIÓN: Sistema de Lotería Galáctica FXU
-- =====================================================
-- "Coordenadas Galácticas" - Lotería semanal con FXU
-- 4 números del 1 al 30 (sin repetir)
-- Ticket: 50 FXU (VIP: 25 FXU) - Max 10 por sorteo
-- Distribución: 70% pozo, 20% admin, 10% pools
-- Sorteo: Semanal (domingo medianoche UTC)
-- Jackpot acumulativo si no hay ganador
-- =====================================================

-- 1. Tabla de sorteos
CREATE TABLE IF NOT EXISTS lottery_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_number serial,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'completed')),
  winning_numbers integer[] DEFAULT NULL,
  total_tickets integer DEFAULT 0,
  total_pool numeric DEFAULT 0,
  prize_pool numeric DEFAULT 0,
  admin_revenue numeric DEFAULT 0,
  reward_pool_share numeric DEFAULT 0,
  jackpot_winner_id uuid REFERENCES profiles(id) DEFAULT NULL,
  jackpot_amount numeric DEFAULT 0,
  accumulated_jackpot numeric DEFAULT 0,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  drawn_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lottery_draws_status ON lottery_draws(status);
CREATE INDEX IF NOT EXISTS idx_lottery_draws_closes_at ON lottery_draws(closes_at);

-- 2. Tabla de tickets
CREATE TABLE IF NOT EXISTS lottery_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id uuid NOT NULL REFERENCES lottery_draws(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  numbers integer[] NOT NULL,
  cost numeric NOT NULL,
  matches integer DEFAULT 0,
  prize numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lottery_tickets_draw_id ON lottery_tickets(draw_id);
CREATE INDEX IF NOT EXISTS idx_lottery_tickets_user_id ON lottery_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_lottery_tickets_draw_user ON lottery_tickets(draw_id, user_id);

-- 3. Tabla de ganadores (historial)
CREATE TABLE IF NOT EXISTS lottery_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id uuid NOT NULL REFERENCES lottery_draws(id),
  user_id uuid NOT NULL REFERENCES profiles(id),
  matches integer NOT NULL,
  prize numeric NOT NULL,
  numbers integer[] NOT NULL,
  winning_numbers integer[] NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lottery_winners_user_id ON lottery_winners(user_id);

-- 4. Agregar 'lottery_fee' al constraint de revenue_type
ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type = ANY (ARRAY[
    'market_fee', 'withdrawal_fee', 'instant_build', 'instant_research',
    'instant_ship', 'referral_bonus', 'officer_fxu', 'expedition_fee',
    'supply_box', 'fleet_acceleration', 'swap_fee', 'transfer_fee',
    'plus_subscription', 'colony_abandon', 'planet_rename', 'alliance_rename',
    'alliance_creation', 'lottery_fee', 'other'
  ]));

-- 5. RLS policies
ALTER TABLE lottery_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view draws" ON lottery_draws;
CREATE POLICY "Anyone can view draws" ON lottery_draws FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view winners" ON lottery_winners;
CREATE POLICY "Anyone can view winners" ON lottery_winners FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view own tickets" ON lottery_tickets;
CREATE POLICY "Users can view own tickets" ON lottery_tickets FOR SELECT USING (auth.uid() = user_id);

-- 6. Configuración en game_settings
INSERT INTO game_settings (key, value, description)
VALUES ('lottery_ticket_cost', '50', 'Costo en FXU por ticket de lotería')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES ('lottery_max_tickets', '10', 'Máximo de tickets por usuario por sorteo')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES ('lottery_prize_pool_pct', '70', 'Porcentaje del ticket que va al pozo de premios')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES ('lottery_admin_pct', '20', 'Porcentaje del ticket que va al admin')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES ('lottery_reward_pool_pct', '10', 'Porcentaje del ticket que va a pools de recompensa')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES ('lottery_3match_prize', '500', 'Premio fijo en FXU por 3 aciertos')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES ('lottery_2match_prize', '50', 'Premio fijo en FXU por 2 aciertos')
ON CONFLICT (key) DO NOTHING;

INSERT INTO game_settings (key, value, description)
VALUES ('lottery_enabled', 'true', 'Si la lotería está habilitada')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 7. Función: get_lottery_info
-- Devuelve info del sorteo activo + historial
-- =====================================================
CREATE OR REPLACE FUNCTION get_lottery_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
BEGIN
  v_user_id := auth.uid();
  
  -- Check if enabled
  SELECT COALESCE(value::boolean, true) INTO v_enabled
  FROM game_settings WHERE key = 'lottery_enabled';
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  -- Get config
  SELECT COALESCE(value::integer, 50) INTO v_ticket_cost FROM game_settings WHERE key = 'lottery_ticket_cost';
  SELECT COALESCE(value::integer, 10) INTO v_max_tickets FROM game_settings WHERE key = 'lottery_max_tickets';
  IF v_ticket_cost IS NULL THEN v_ticket_cost := 50; END IF;
  IF v_max_tickets IS NULL THEN v_max_tickets := 10; END IF;

  -- Prize amounts from config
  v_prize_3match := COALESCE((SELECT value::integer FROM game_settings WHERE key = 'lottery_3match_prize'), 500);
  v_prize_2match := COALESCE((SELECT value::integer FROM game_settings WHERE key = 'lottery_2match_prize'), 50);

  v_is_plus := is_user_plus(v_user_id);
  v_final_cost := v_ticket_cost;
  IF v_is_plus THEN
    v_final_cost := CEIL(v_ticket_cost * 0.50);
  END IF;

  -- Get active draw (including pending execution - buy is blocked by buy_lottery_ticket)
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
    'prize_2match', v_prize_2match
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_lottery_info() TO authenticated;

-- =====================================================
-- 8. Función: buy_lottery_ticket
-- =====================================================
CREATE OR REPLACE FUNCTION buy_lottery_ticket(p_numbers integer[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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

  -- Check duplicates
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
  SELECT COALESCE(value::integer, 50) INTO v_ticket_cost FROM game_settings WHERE key = 'lottery_ticket_cost';
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
$$;

GRANT EXECUTE ON FUNCTION buy_lottery_ticket(integer[]) TO authenticated;

-- =====================================================
-- 9. Función: execute_lottery_draw (ADMIN)
-- Ejecuta el sorteo, genera números y distribuye premios
-- =====================================================
CREATE OR REPLACE FUNCTION execute_lottery_draw(p_draw_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_draw record;
  v_winning integer[];
  v_num integer;
  v_ticket record;
  v_match_count integer;
  v_prize_3match integer;
  v_prize_2match integer;
  v_total_minor_prizes numeric := 0;
  v_jackpot_winners integer := 0;
  v_jackpot_per_winner numeric := 0;
  v_remaining_jackpot numeric := 0;
  v_total_jackpot numeric := 0;
  v_winners_3 integer := 0;
  v_winners_2 integer := 0;
  v_next_draw_id uuid;
BEGIN
  -- Admin check
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Get draw to execute (FOR UPDATE prevents double execution & serializes with ticket purchases)
  IF p_draw_id IS NOT NULL THEN
    SELECT * INTO v_draw FROM lottery_draws WHERE id = p_draw_id AND status IN ('open', 'closed') FOR UPDATE;
  ELSE
    SELECT * INTO v_draw FROM lottery_draws WHERE status = 'open' ORDER BY closes_at ASC LIMIT 1 FOR UPDATE;
  END IF;

  IF v_draw.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay sorteo pendiente');
  END IF;

  -- Generate 4 random unique numbers 1-30
  v_winning := ARRAY[]::integer[];
  WHILE array_length(v_winning, 1) IS NULL OR array_length(v_winning, 1) < 4 LOOP
    v_num := FLOOR(random() * 30 + 1)::integer;
    IF NOT v_num = ANY(v_winning) THEN
      v_winning := v_winning || v_num;
    END IF;
  END LOOP;
  -- Sort
  SELECT ARRAY(SELECT unnest(v_winning) ORDER BY 1) INTO v_winning;

  -- Get prize config
  SELECT COALESCE(value::integer, 500) INTO v_prize_3match FROM game_settings WHERE key = 'lottery_3match_prize';
  SELECT COALESCE(value::integer, 50) INTO v_prize_2match FROM game_settings WHERE key = 'lottery_2match_prize';
  IF v_prize_3match IS NULL THEN v_prize_3match := 500; END IF;
  IF v_prize_2match IS NULL THEN v_prize_2match := 50; END IF;

  -- Total jackpot = accumulated + current prize_pool
  v_total_jackpot := COALESCE(v_draw.accumulated_jackpot, 0) + COALESCE(v_draw.prize_pool, 0);

  -- Set FXU context once for all prize payments
  PERFORM _internal_set_fxu_context();

  -- Process each ticket
  FOR v_ticket IN SELECT * FROM lottery_tickets WHERE draw_id = v_draw.id LOOP
    -- Count matches
    SELECT COUNT(*) INTO v_match_count
    FROM unnest(v_ticket.numbers) n WHERE n = ANY(v_winning);

    -- Update ticket
    UPDATE lottery_tickets SET matches = v_match_count WHERE id = v_ticket.id;

    IF v_match_count = 4 THEN
      v_jackpot_winners := v_jackpot_winners + 1;
    ELSIF v_match_count = 3 THEN
      v_winners_3 := v_winners_3 + 1;
      v_total_minor_prizes := v_total_minor_prizes + v_prize_3match;
      -- Pay prize
      UPDATE profiles SET fxu_balance = fxu_balance + v_prize_3match WHERE id = v_ticket.user_id;
      UPDATE lottery_tickets SET prize = v_prize_3match WHERE id = v_ticket.id;
      -- Record winner
      INSERT INTO lottery_winners (draw_id, user_id, matches, prize, numbers, winning_numbers)
      VALUES (v_draw.id, v_ticket.user_id, 3, v_prize_3match, v_ticket.numbers, v_winning);
    ELSIF v_match_count = 2 THEN
      v_winners_2 := v_winners_2 + 1;
      v_total_minor_prizes := v_total_minor_prizes + v_prize_2match;
      -- Pay prize
      UPDATE profiles SET fxu_balance = fxu_balance + v_prize_2match WHERE id = v_ticket.user_id;
      UPDATE lottery_tickets SET prize = v_prize_2match WHERE id = v_ticket.id;
      -- Record winner
      INSERT INTO lottery_winners (draw_id, user_id, matches, prize, numbers, winning_numbers)
      VALUES (v_draw.id, v_ticket.user_id, 2, v_prize_2match, v_ticket.numbers, v_winning);
    END IF;
  END LOOP;

  -- Handle jackpot
  IF v_jackpot_winners > 0 THEN
    v_jackpot_per_winner := FLOOR(v_total_jackpot / v_jackpot_winners);
    v_remaining_jackpot := 0;

    -- Pay jackpot winners
    FOR v_ticket IN SELECT * FROM lottery_tickets WHERE draw_id = v_draw.id AND matches = 4 LOOP
      UPDATE profiles SET fxu_balance = fxu_balance + v_jackpot_per_winner WHERE id = v_ticket.user_id;
      UPDATE lottery_tickets SET prize = v_jackpot_per_winner WHERE id = v_ticket.id;
      INSERT INTO lottery_winners (draw_id, user_id, matches, prize, numbers, winning_numbers)
      VALUES (v_draw.id, v_ticket.user_id, 4, v_jackpot_per_winner, v_ticket.numbers, v_winning);
    END LOOP;

    -- Update draw with first jackpot winner
    UPDATE lottery_draws SET
      jackpot_winner_id = (SELECT user_id FROM lottery_tickets WHERE draw_id = v_draw.id AND matches = 4 LIMIT 1),
      jackpot_amount = v_jackpot_per_winner * v_jackpot_winners
    WHERE id = v_draw.id;
  ELSE
    v_remaining_jackpot := v_total_jackpot;
  END IF;

  -- Close draw
  UPDATE lottery_draws SET
    status = 'completed',
    winning_numbers = v_winning,
    drawn_at = now()
  WHERE id = v_draw.id;

  -- Create next draw (next Sunday 23:59 UTC — max 7 days)
  INSERT INTO lottery_draws (
    status, opens_at, closes_at, accumulated_jackpot
  ) VALUES (
    'open',
    now(),
    (date_trunc('week', now() + interval '1 day') + interval '6 days 23 hours 59 minutes')::timestamptz,
    v_remaining_jackpot
  ) RETURNING id INTO v_next_draw_id;

  RETURN jsonb_build_object(
    'success', true,
    'draw_number', v_draw.draw_number,
    'winning_numbers', v_winning,
    'total_tickets', v_draw.total_tickets,
    'total_pool', v_draw.total_pool,
    'jackpot', v_total_jackpot,
    'jackpot_winners', v_jackpot_winners,
    'jackpot_per_winner', v_jackpot_per_winner,
    'winners_3match', v_winners_3,
    'winners_2match', v_winners_2,
    'minor_prizes_paid', v_total_minor_prizes,
    'accumulated_to_next', v_remaining_jackpot,
    'next_draw_id', v_next_draw_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION execute_lottery_draw(uuid) TO authenticated;

-- =====================================================
-- 10. Función admin: admin_update_lottery_settings
-- =====================================================
CREATE OR REPLACE FUNCTION admin_update_lottery_settings(
  p_ticket_cost integer DEFAULT NULL,
  p_max_tickets integer DEFAULT NULL,
  p_prize_pool_pct integer DEFAULT NULL,
  p_admin_pct integer DEFAULT NULL,
  p_reward_pool_pct integer DEFAULT NULL,
  p_prize_3match integer DEFAULT NULL,
  p_prize_2match integer DEFAULT NULL,
  p_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  IF p_ticket_cost IS NOT NULL AND p_ticket_cost > 0 THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_ticket_cost', p_ticket_cost::text, 'Costo ticket lotería')
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
    VALUES ('lottery_3match_prize', p_prize_3match::text, 'Premio 3 aciertos')
    ON CONFLICT (key) DO UPDATE SET value = p_prize_3match::text;
  END IF;

  IF p_prize_2match IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_2match_prize', p_prize_2match::text, 'Premio 2 aciertos')
    ON CONFLICT (key) DO UPDATE SET value = p_prize_2match::text;
  END IF;

  IF p_enabled IS NOT NULL THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('lottery_enabled', p_enabled::text, 'Lotería habilitada')
    ON CONFLICT (key) DO UPDATE SET value = p_enabled::text;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_lottery_settings(integer, integer, integer, integer, integer, integer, integer, boolean) TO authenticated;

-- =====================================================
-- 11. Función: create_lottery_draw (ADMIN)
-- Crea un nuevo sorteo manualmente
-- =====================================================
CREATE OR REPLACE FUNCTION create_lottery_draw(p_closes_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_existing record;
  v_accumulated numeric := 0;
  v_draw_id uuid;
  v_close_date timestamptz;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Check if there's already an open draw (FOR UPDATE prevents duplicate creation)
  SELECT * INTO v_existing FROM lottery_draws WHERE status = 'open' LIMIT 1 FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya hay un sorteo activo (#' || v_existing.draw_number || '). Ciérralo primero.');
  END IF;

  -- Get accumulated jackpot from last completed draw
  SELECT COALESCE(accumulated_jackpot, 0) + COALESCE(prize_pool, 0)
  INTO v_accumulated
  FROM lottery_draws WHERE status = 'completed'
  AND jackpot_winner_id IS NULL
  ORDER BY drawn_at DESC LIMIT 1;

  IF v_accumulated IS NULL THEN v_accumulated := 0; END IF;

  -- Set close date (default: next Sunday 23:59 UTC — max 7 days)
  v_close_date := COALESCE(p_closes_at,
    (date_trunc('week', now() + interval '1 day') + interval '6 days 23 hours 59 minutes')::timestamptz
  );

  INSERT INTO lottery_draws (status, opens_at, closes_at, accumulated_jackpot)
  VALUES ('open', now(), v_close_date, v_accumulated)
  RETURNING id INTO v_draw_id;

  RETURN jsonb_build_object(
    'success', true,
    'draw_id', v_draw_id,
    'closes_at', v_close_date,
    'accumulated_jackpot', v_accumulated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_lottery_draw(timestamptz) TO authenticated;
