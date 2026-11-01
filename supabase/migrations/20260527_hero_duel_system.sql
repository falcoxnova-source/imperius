-- Duelo Galactico - Hero Ship PvP Duel System
-- Players stake FXU, ships travel 10min, dice roll based on stats decides winner

CREATE TABLE IF NOT EXISTS hero_duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  opponent_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  stake integer NOT NULL CHECK (stake > 0),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'accepted', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  resolves_at timestamptz,
  winner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  loser_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  creator_hp_before integer,
  opponent_hp_before integer,
  creator_level_before integer,
  opponent_level_before integer
);

-- Add 'hero_duel' to admin_revenue revenue_type check
ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type IN (
    'market_fee','withdrawal_fee','instant_build','instant_research',
    'instant_ship','referral_bonus','officer_fxu','expedition_fee',
    'supply_box','fleet_acceleration','swap_fee','transfer_fee',
    'plus_subscription','colony_abandon','planet_rename',
    'alliance_rename','alliance_creation','lottery_fee',
    'p2p_fee','blueprint_sale','hero_respec','other',
    'premium_mission','hero_duel'
  ));

-- =============================================
-- CREATE DUEL
-- =============================================
CREATE OR REPLACE FUNCTION create_hero_duel(p_stake integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_balance numeric;
  v_ship record;
  v_duel_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  IF p_stake < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La apuesta minima es 10 FXU');
  END IF;

  PERFORM create_hero_ship(v_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = v_user_id;
  IF v_ship.hp <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu nave esta daniada. Reparala antes de crear un duelo');
  END IF;

  IF v_ship.repair_until IS NOT NULL AND now() < v_ship.repair_until THEN
    RETURN jsonb_build_object('success', false, 'error', 'La nave esta siendo reparada. Espera a que termine');
  END IF;

  IF EXISTS (SELECT 1 FROM hero_duels WHERE (creator_id = v_user_id OR opponent_id = v_user_id) AND status IN ('waiting', 'accepted')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un duelo activo');
  END IF;

  SELECT fxu_balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance < p_stake THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas: ' || p_stake || ', tienes: ' || FLOOR(v_balance));
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - p_stake WHERE id = v_user_id;

  INSERT INTO hero_duels (creator_id, stake, creator_hp_before, creator_level_before)
  VALUES (v_user_id, p_stake, v_ship.hp, v_ship.level)
  RETURNING id INTO v_duel_id;

  RETURN jsonb_build_object('success', true, 'duel_id', v_duel_id);
END;
$$;

-- =============================================
-- ACCEPT DUEL
-- =============================================
CREATE OR REPLACE FUNCTION accept_hero_duel(p_duel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_duel record;
  v_balance numeric;
  v_ship record;
  v_creator_ship record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_duel FROM hero_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duelo no encontrado');
  END IF;

  IF v_duel.status != 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este duelo ya no esta disponible');
  END IF;

  IF v_duel.creator_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes aceptar tu propio duelo');
  END IF;

  PERFORM create_hero_ship(v_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = v_user_id;
  IF v_ship.hp <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu nave esta daniada. Reparala antes de aceptar un duelo');
  END IF;

  IF v_ship.repair_until IS NOT NULL AND now() < v_ship.repair_until THEN
    RETURN jsonb_build_object('success', false, 'error', 'La nave esta siendo reparada. Espera a que termine');
  END IF;

  IF EXISTS (SELECT 1 FROM hero_duels WHERE (creator_id = v_user_id OR opponent_id = v_user_id) AND status IN ('waiting', 'accepted')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un duelo activo');
  END IF;

  SELECT * INTO v_creator_ship FROM user_hero_ships WHERE user_id = v_duel.creator_id;
  IF ABS(v_ship.level - v_creator_ship.level) > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Diferencia de nivel maxima: 5. Tu nivel: ' || v_ship.level || ', Rival: ' || v_creator_ship.level);
  END IF;

  SELECT fxu_balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance < v_duel.stake THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas: ' || v_duel.stake || ', tienes: ' || FLOOR(v_balance));
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_duel.stake WHERE id = v_user_id;

  UPDATE hero_duels SET
    opponent_id = v_user_id,
    status = 'accepted',
    accepted_at = now(),
    resolves_at = now() + interval '10 minutes',
    opponent_hp_before = v_ship.hp,
    opponent_level_before = v_ship.level,
    updated_at = now()
  WHERE id = p_duel_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Duelo aceptado. La batalla comenzara en 10 minutos',
    'resolves_at', (now() + interval '10 minutes')::text
  );
END;
$$;

-- =============================================
-- CANCEL DUEL (creator only, while waiting)
-- =============================================
CREATE OR REPLACE FUNCTION cancel_hero_duel(p_duel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_duel record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_duel FROM hero_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duelo no encontrado');
  END IF;

  IF v_duel.creator_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo el creador puede cancelar el duelo');
  END IF;

  IF v_duel.status != 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El duelo ya no se puede cancelar');
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance + v_duel.stake WHERE id = v_user_id;

  UPDATE hero_duels SET status = 'cancelled', updated_at = now() WHERE id = p_duel_id;

  RETURN jsonb_build_object('success', true, 'message', 'Duelo cancelado');
END;
$$;

-- =============================================
-- RESOLVE DUEL (auto-triggered by frontend when countdown ends)
-- =============================================
CREATE OR REPLACE FUNCTION resolve_hero_duel(p_duel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duel record;
  v_creator_ship record;
  v_opponent_ship record;
  v_creator_power numeric;
  v_opponent_power numeric;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_bet integer;
  v_referrer_amount integer;
  v_company_amount integer;
  v_admin_id uuid;
  v_referrer_id uuid;
  v_winner_hp_loss integer;
  v_total_power numeric;
BEGIN
  SELECT * INTO v_duel FROM hero_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duelo no encontrado');
  END IF;

  IF v_duel.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_resolved', true,
      'winner_id', v_duel.winner_id,
      'loser_id', v_duel.loser_id);
  END IF;

  IF v_duel.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El duelo no esta en estado aceptado');
  END IF;

  IF now() < v_duel.resolves_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'El duelo aun no llega al punto de batalla');
  END IF;

  SELECT * INTO v_creator_ship FROM user_hero_ships WHERE user_id = v_duel.creator_id;
  SELECT * INTO v_opponent_ship FROM user_hero_ships WHERE user_id = v_duel.opponent_id;

  v_creator_power :=
    COALESCE(v_creator_ship.attack_points, 0) * 3 +
    COALESCE(v_creator_ship.defense_points, 0) * 2 +
    COALESCE(v_creator_ship.shield_points, 0) * 1.5 +
    COALESCE(v_creator_ship.speed_points, 0) +
    COALESCE(v_creator_ship.level, 1) * 5 +
    (GREATEST(COALESCE(v_duel.creator_hp_before, 100), 0)::numeric / GREATEST(COALESCE(v_creator_ship.hp_max, 100), 1)) * 50;

  v_opponent_power :=
    COALESCE(v_opponent_ship.attack_points, 0) * 3 +
    COALESCE(v_opponent_ship.defense_points, 0) * 2 +
    COALESCE(v_opponent_ship.shield_points, 0) * 1.5 +
    COALESCE(v_opponent_ship.speed_points, 0) +
    COALESCE(v_opponent_ship.level, 1) * 5 +
    (GREATEST(COALESCE(v_duel.opponent_hp_before, 100), 0)::numeric / GREATEST(COALESCE(v_opponent_ship.hp_max, 100), 1)) * 50;

  -- Determine winner
  IF random() * (v_creator_power + v_opponent_power) <= v_creator_power THEN
    v_winner_id := v_duel.creator_id;
    v_loser_id := v_duel.opponent_id;
  ELSE
    v_winner_id := v_duel.opponent_id;
    v_loser_id := v_duel.creator_id;
  END IF;

  -- Apply HP damage from combat
  v_total_power := GREATEST(v_creator_power + v_opponent_power, 1);
  IF v_winner_id = v_duel.creator_id THEN
    v_winner_hp_loss := CEIL((v_opponent_power / v_total_power) * v_creator_ship.hp_max);
    UPDATE user_hero_ships SET hp = GREATEST(1, hp - v_winner_hp_loss), updated_at = now() WHERE user_id = v_winner_id;
  ELSE
    v_winner_hp_loss := CEIL((v_creator_power / v_total_power) * v_opponent_ship.hp_max);
    UPDATE user_hero_ships SET hp = GREATEST(1, hp - v_winner_hp_loss), updated_at = now() WHERE user_id = v_winner_id;
  END IF;
  UPDATE user_hero_ships SET hp = 1, updated_at = now() WHERE user_id = v_loser_id;

  -- Distribute FXU
  PERFORM _internal_set_fxu_context();

  -- Winner: own stake back + 80% of loser's stake
  v_winner_bet := CEIL(v_duel.stake * 80 / 100);
  UPDATE profiles SET fxu_balance = fxu_balance + v_duel.stake + v_winner_bet WHERE id = v_winner_id;

  -- Remaining 20% of loser's stake
  v_company_amount := v_duel.stake - v_winner_bet;

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_winner_id;
  IF v_referrer_id IS NOT NULL THEN
    v_referrer_amount := CEIL(v_duel.stake * 5 / 100);
    v_company_amount := v_company_amount - v_referrer_amount;
    IF v_referrer_amount > 0 THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_referrer_amount WHERE id = v_referrer_id;
    END IF;
  END IF;

  IF v_company_amount > 0 THEN
    v_admin_id := get_admin_account_id();
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles SET fxu_balance = fxu_balance + CEIL(v_company_amount / 2) WHERE id = v_admin_id;
    END IF;
    PERFORM record_admin_revenue('hero_duel', v_company_amount, 'Duelo galactico - ganador: ' || v_winner_id::text, v_loser_id, p_duel_id);
    PERFORM contribute_to_jackpot((v_company_amount / 2)::numeric, 'hero_duel', v_winner_id);
  END IF;

  UPDATE hero_duels SET
    status = 'completed',
    winner_id = v_winner_id,
    loser_id = v_loser_id,
    updated_at = now()
  WHERE id = p_duel_id;

  RETURN jsonb_build_object(
    'success', true,
    'winner_id', v_winner_id,
    'loser_id', v_loser_id,
    'winner_amount', v_duel.stake + v_winner_bet,
    'message', 'Duelo resuelto'
  );
END;
$$;

-- =============================================
-- GET AVAILABLE DUEL OFFERS
-- =============================================
CREATE OR REPLACE FUNCTION get_hero_duel_offers(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'creator_id', d.creator_id,
    'creator_username', p.username,
    'creator_level', d.creator_level_before,
    'stake', d.stake,
    'created_at', d.created_at::text
  ) ORDER BY d.created_at DESC), '[]'::jsonb) INTO v_result
  FROM hero_duels d
  JOIN profiles p ON p.id = d.creator_id
  WHERE d.status = 'waiting'
    AND (p_user_id IS NULL OR d.creator_id != p_user_id);

  RETURN v_result;
END;
$$;

-- =============================================
-- GET MY ACTIVE DUEL (with auto-resolve when ready)
-- =============================================
CREATE OR REPLACE FUNCTION get_my_hero_duel(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duel record;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_bet integer;
  v_referrer_amount integer;
  v_company_amount integer;
  v_admin_id uuid;
  v_referrer_id uuid;
  v_winner_hp_loss integer;
  v_total_power numeric;
  v_creator_ship record;
  v_opponent_ship record;
  v_creator_power numeric;
  v_opponent_power numeric;
BEGIN
  SELECT d.*,
    cp.username AS creator_username,
    op.username AS opponent_username
  INTO v_duel
  FROM hero_duels d
  LEFT JOIN profiles cp ON cp.id = d.creator_id
  LEFT JOIN profiles op ON op.id = d.opponent_id
  WHERE (d.creator_id = p_user_id OR d.opponent_id = p_user_id)
    AND d.status IN ('waiting', 'accepted')
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'null'::jsonb;
  END IF;

  -- Auto-resolve if duel is ready
  IF v_duel.status = 'accepted' AND now() >= v_duel.resolves_at THEN
    SELECT * INTO v_creator_ship FROM user_hero_ships WHERE user_id = v_duel.creator_id;
    SELECT * INTO v_opponent_ship FROM user_hero_ships WHERE user_id = v_duel.opponent_id;

    v_creator_power :=
      COALESCE(v_creator_ship.attack_points, 0) * 3 +
      COALESCE(v_creator_ship.defense_points, 0) * 2 +
      COALESCE(v_creator_ship.shield_points, 0) * 1.5 +
      COALESCE(v_creator_ship.speed_points, 0) +
      COALESCE(v_creator_ship.level, 1) * 5 +
      (GREATEST(COALESCE(v_duel.creator_hp_before, 100), 0)::numeric / GREATEST(COALESCE(v_creator_ship.hp_max, 100), 1)) * 50;

    v_opponent_power :=
      COALESCE(v_opponent_ship.attack_points, 0) * 3 +
      COALESCE(v_opponent_ship.defense_points, 0) * 2 +
      COALESCE(v_opponent_ship.shield_points, 0) * 1.5 +
      COALESCE(v_opponent_ship.speed_points, 0) +
      COALESCE(v_opponent_ship.level, 1) * 5 +
      (GREATEST(COALESCE(v_duel.opponent_hp_before, 100), 0)::numeric / GREATEST(COALESCE(v_opponent_ship.hp_max, 100), 1)) * 50;

    IF random() * (v_creator_power + v_opponent_power) <= v_creator_power THEN
      v_winner_id := v_duel.creator_id;
      v_loser_id := v_duel.opponent_id;
    ELSE
      v_winner_id := v_duel.opponent_id;
      v_loser_id := v_duel.creator_id;
    END IF;

    v_total_power := GREATEST(v_creator_power + v_opponent_power, 1);
    IF v_winner_id = v_duel.creator_id THEN
      v_winner_hp_loss := CEIL((v_opponent_power / v_total_power) * v_creator_ship.hp_max);
      UPDATE user_hero_ships SET hp = GREATEST(1, hp - v_winner_hp_loss), updated_at = now() WHERE user_id = v_winner_id;
    ELSE
      v_winner_hp_loss := CEIL((v_creator_power / v_total_power) * v_opponent_ship.hp_max);
      UPDATE user_hero_ships SET hp = GREATEST(1, hp - v_winner_hp_loss), updated_at = now() WHERE user_id = v_winner_id;
    END IF;
    UPDATE user_hero_ships SET hp = 1, updated_at = now() WHERE user_id = v_loser_id;

    PERFORM _internal_set_fxu_context();

    v_winner_bet := CEIL(v_duel.stake * 80 / 100);
    UPDATE profiles SET fxu_balance = fxu_balance + v_duel.stake + v_winner_bet WHERE id = v_winner_id;

    v_company_amount := v_duel.stake - v_winner_bet;

    SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_winner_id;
    IF v_referrer_id IS NOT NULL THEN
      v_referrer_amount := CEIL(v_duel.stake * 5 / 100);
      v_company_amount := v_company_amount - v_referrer_amount;
      IF v_referrer_amount > 0 THEN
        UPDATE profiles SET fxu_balance = fxu_balance + v_referrer_amount WHERE id = v_referrer_id;
      END IF;
    END IF;

    IF v_company_amount > 0 THEN
      v_admin_id := get_admin_account_id();
      IF v_admin_id IS NOT NULL THEN
        UPDATE profiles SET fxu_balance = fxu_balance + CEIL(v_company_amount / 2) WHERE id = v_admin_id;
      END IF;
      PERFORM record_admin_revenue('hero_duel', v_company_amount, 'Duelo galactico - ganador: ' || v_winner_id::text, v_loser_id, v_duel.id);
      PERFORM contribute_to_jackpot((v_company_amount / 2)::numeric, 'hero_duel', v_winner_id);
    END IF;

    UPDATE hero_duels SET status = 'completed', winner_id = v_winner_id, loser_id = v_loser_id, updated_at = now() WHERE id = v_duel.id;

    RETURN jsonb_build_object(
      'id', v_duel.id,
      'status', 'completed',
      'stake', v_duel.stake,
      'winner_id', v_winner_id,
      'loser_id', v_loser_id,
      'winner_amount', v_duel.stake + v_winner_bet,
      'creator_username', v_duel.creator_username,
      'opponent_username', v_duel.opponent_username
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_duel.id,
    'status', v_duel.status,
    'stake', v_duel.stake,
    'creator_id', v_duel.creator_id,
    'creator_username', v_duel.creator_username,
    'creator_level', v_duel.creator_level_before,
    'opponent_id', v_duel.opponent_id,
    'opponent_username', v_duel.opponent_username,
    'opponent_level', v_duel.opponent_level_before,
    'is_creator', (v_duel.creator_id = p_user_id),
    'created_at', v_duel.created_at::text,
    'accepted_at', COALESCE(v_duel.accepted_at::text, NULL),
    'resolves_at', COALESCE(v_duel.resolves_at::text, NULL),
    'remaining_seconds', CASE WHEN v_duel.resolves_at IS NOT NULL
      THEN GREATEST(0, EXTRACT(EPOCH FROM (v_duel.resolves_at - now())))::integer
      ELSE NULL END
  );
END;
$$;

-- =============================================
-- GET HERO DUEL STATUS (wrapper to bypass PostgREST schema cache issues)
-- =============================================
CREATE OR REPLACE FUNCTION get_hero_duel_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_my_hero_duel(p_user_id);
$$;

-- =============================================
-- GET DUEL HISTORY
-- =============================================
CREATE OR REPLACE FUNCTION get_hero_duel_history(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'stake', d.stake,
    'winner_id', d.winner_id,
    'loser_id', d.loser_id,
    'is_winner', (d.winner_id = p_user_id),
    'opponent_username', CASE WHEN d.creator_id = p_user_id
      THEN (SELECT username FROM profiles WHERE id = d.opponent_id)
      ELSE (SELECT username FROM profiles WHERE id = d.creator_id) END,
    'opponent_level', CASE WHEN d.creator_id = p_user_id
      THEN d.opponent_level_before
      ELSE d.creator_level_before END,
    'resolved_at', d.updated_at::text
  ) ORDER BY d.updated_at DESC), '[]'::jsonb) INTO v_result
  FROM hero_duels d
  WHERE d.status = 'completed'
    AND (d.creator_id = p_user_id OR d.opponent_id = p_user_id);

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_hero_duel(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_hero_duel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_hero_duel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_hero_duel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_duel_offers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_hero_duel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_duel_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_duel_history(uuid) TO authenticated;
