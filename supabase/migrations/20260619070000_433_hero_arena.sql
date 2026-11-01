-- Apply 4-3-3 fee split to hero arena duels (same as market)
-- Fee: 20% of stake. Split: 40% admin, 30% pool, 30% referral (→ pool if no referrer)
-- Removes the old separate 5% referrer bonus (now included in the 30% referral share)
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
  v_admin_id uuid;
  v_referrer_id uuid;
  v_winner_hp_loss integer;
  v_total_power numeric;
  -- Fee split variables
  v_fee integer;
  v_admin_fee integer;
  v_pool_fee integer;
  v_referral_fee integer;
  v_admin_share numeric;
  v_pool_share numeric;
  v_referral_share numeric;
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

  -- Read configurable shares (same keys as main market)
  SELECT COALESCE(value::numeric, 40) INTO v_admin_share FROM game_settings WHERE key = 'market_fee_admin_share';
  SELECT COALESCE(value::numeric, 30) INTO v_pool_share FROM game_settings WHERE key = 'market_fee_pool_share';
  SELECT COALESCE(value::numeric, 30) INTO v_referral_share FROM game_settings WHERE key = 'market_fee_referral_share';

  -- Fee = 20% of one stake
  v_fee := CEIL(v_duel.stake * 0.2);
  -- Winner gets: both stakes back minus fee = 2 * stake - fee
  v_winner_bet := 2 * v_duel.stake - v_fee;

  -- 4-3-3 split of the fee
  v_admin_fee := FLOOR(v_fee * v_admin_share / 100);
  v_pool_fee := FLOOR(v_fee * v_pool_share / 100);
  v_referral_fee := FLOOR(v_fee * v_referral_share / 100);

  -- Referrer: from the referral share (falls back to pool if no referrer)
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_winner_id;
  IF v_referrer_id IS NOT NULL AND v_referral_fee > 0 THEN
    -- Paid from the referral share
    NULL; -- will be paid below
  ELSE
    -- No referrer → referral share goes to pool
    v_pool_fee := v_pool_fee + v_referral_fee;
    v_referral_fee := 0;
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
  -- Both players already paid their stake at create/accept (total = 2 * stake)
  -- Pay winner
  UPDATE profiles SET fxu_balance = fxu_balance + v_winner_bet WHERE id = v_winner_id;
  -- Loser already paid at acceptance, no further deduction

  -- Admin fee
  SELECT get_admin_account_id() INTO v_admin_id;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;
    PERFORM record_admin_revenue('hero_duel', v_admin_fee,
      'Hero duel fee (' || v_admin_share || '% admin, ' || v_pool_share || '% pool, ' || v_referral_share || '% referral)',
      v_winner_id, p_duel_id);
  END IF;

  -- Pool contribution
  IF v_pool_fee > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_fee::numeric, 'hero_duel', v_winner_id);
  END IF;

  -- Referrer reward (from the fee split, not additional)
  IF v_referrer_id IS NOT NULL AND v_referral_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_referral_fee WHERE id = v_referrer_id;
  END IF;

  UPDATE hero_duels SET
    status = 'completed',
    winner_id = v_winner_id,
    loser_id = v_loser_id,
    updated_at = now()
  WHERE id = p_duel_id;

  -- Winner XP gain (scaled by level difference)
  DECLARE
    v_level_diff integer;
    v_xp_gain integer;
  BEGIN
    v_level_diff := GREATEST(1, COALESCE((SELECT level FROM user_hero_ships WHERE user_id = v_loser_id), 1) - COALESCE((SELECT level FROM user_hero_ships WHERE user_id = v_winner_id), 1));
    v_xp_gain := 50 + v_level_diff * 10 + FLOOR(v_duel.stake / 10);
    UPDATE user_hero_ships SET xp = xp + v_xp_gain, updated_at = now() WHERE user_id = v_winner_id;
  END;

  RETURN jsonb_build_object('success', true,
    'winner_id', v_winner_id,
    'loser_id', v_loser_id,
    'winner_amount', v_winner_bet,
    'winner_hp_loss', v_winner_hp_loss);
END;
$$;
