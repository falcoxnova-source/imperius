-- Fix purchase_daily_mission_bonus:
-- 1) Use _internal_set_fxu_context() for consistency
-- 2) Credit admin wallet with the full FXU amount
-- 3) Record revenue in admin_revenue

CREATE OR REPLACE FUNCTION purchase_daily_mission_bonus(p_user_id uuid, p_mission_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission record;
  v_fxu_balance numeric;
  v_bonus_id uuid;
  v_admin_id uuid;
BEGIN
  SELECT * INTO v_mission
  FROM daily_missions
  WHERE id = p_mission_id AND mission_type = 'premium' AND is_active = true;

  IF v_mission IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mision premium no encontrada');
  END IF;

  SELECT fxu_balance INTO v_fxu_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_fxu_balance < v_mission.cost_fxu THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficientes. Necesitas ' || v_mission.cost_fxu || ' FXU');
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_mission.cost_fxu WHERE id = p_user_id;

  INSERT INTO user_active_bonuses (user_id, mission_id, bonus_type, bonus_value, expires_at)
  VALUES (p_user_id, p_mission_id, v_mission.reward_type, v_mission.reward_value, now() + (v_mission.reward_duration_hours || ' hours')::interval)
  RETURNING id INTO v_bonus_id;

  -- Credit admin wallet
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    PERFORM _internal_set_fxu_context();
    UPDATE profiles SET fxu_balance = fxu_balance + v_mission.cost_fxu WHERE id = v_admin_id;
  END IF;

  -- Record revenue
  PERFORM record_admin_revenue(
    'premium_mission',
    v_mission.cost_fxu,
    'Premium mission: ' || v_mission.title_es || ' (' || v_mission.code || ')',
    p_user_id,
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'bonus_type', v_mission.reward_type,
    'bonus_value', v_mission.reward_value,
    'expires_at', now() + (v_mission.reward_duration_hours || ' hours')::interval,
    'cost_fxu', v_mission.cost_fxu
  );
END;
$$;
