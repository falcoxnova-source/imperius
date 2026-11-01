-- Prevent buying a premium mission that's already active
-- Also fix get_user_active_bonuses to return mission_id

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
  v_admin_amount numeric;
  v_pool_amount numeric;
BEGIN
  SELECT * INTO v_mission
  FROM daily_missions
  WHERE id = p_mission_id AND mission_type = 'premium' AND is_active = true;

  IF v_mission IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mision premium no encontrada');
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_active_bonuses
    WHERE user_id = p_user_id AND mission_id = p_mission_id AND expires_at > now()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes este bono activo. Espera a que expire.');
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

  v_admin_amount := FLOOR(v_mission.cost_fxu / 2);
  v_pool_amount := v_mission.cost_fxu - v_admin_amount;

  -- 50% a admin wallet
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    PERFORM _internal_set_fxu_context();
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_amount WHERE id = v_admin_id;
  END IF;

  -- 50% a pools de recompensa
  IF v_pool_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_amount, 'premium_mission', p_user_id);
  END IF;

  -- Registrar ingreso admin
  PERFORM record_admin_revenue('premium_mission', v_admin_amount, 'Premium mission: ' || v_mission.title_es || ' (' || v_mission.code || ') 50% admin', p_user_id, NULL);

  RETURN jsonb_build_object(
    'success', true,
    'bonus_type', v_mission.reward_type,
    'bonus_value', v_mission.reward_value,
    'expires_at', now() + (v_mission.reward_duration_hours || ' hours')::interval,
    'cost_fxu', v_mission.cost_fxu
  );
END;
$$;

-- Fix get_user_active_bonuses to include mission_id
CREATE OR REPLACE FUNCTION get_user_active_bonuses(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'id', uab.id,
    'mission_id', uab.mission_id,
    'bonus_type', uab.bonus_type,
    'bonus_value', uab.bonus_value,
    'expires_at', uab.expires_at,
    'title', dm.title_es,
    'icon', dm.icon
  ) ORDER BY uab.expires_at ASC)
  INTO v_result
  FROM user_active_bonuses uab
  LEFT JOIN daily_missions dm ON dm.id = uab.mission_id
  WHERE uab.user_id = p_user_id AND uab.expires_at > now();

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Clean up duplicate active bonuses (keep earliest for each user+mission)
WITH dupes AS (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id, mission_id ORDER BY created_at ASC, id ASC
    ) AS rn
    FROM user_active_bonuses
    WHERE expires_at > now()
  ) t
  WHERE t.rn > 1
)
DELETE FROM user_active_bonuses WHERE id IN (SELECT id FROM dupes);
