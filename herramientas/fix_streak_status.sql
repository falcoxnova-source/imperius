-- Fix get_daily_streak_status to read cost from game_settings
CREATE OR REPLACE FUNCTION public.get_daily_streak_status() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_streak record;
  v_cost integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','No autenticado'); END IF;

  -- Read cost from game_settings, default 300
  SELECT COALESCE(NULLIF(value,'')::integer, 300) INTO v_cost
  FROM public.game_settings WHERE key = 'daily_streak_cost';
  IF v_cost IS NULL OR v_cost < 0 THEN v_cost := 300; END IF;

  SELECT streak_count, best_streak, expires_at
  INTO v_streak
  FROM user_daily_streaks WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',true,'streak',0,'best_streak',0,'expires_at',null,'cost',v_cost,'balance',COALESCE((SELECT fxu_balance FROM profiles WHERE id=v_user_id),0));
  END IF;

  RETURN jsonb_build_object(
    'success',true,
    'streak',COALESCE(v_streak.streak_count,0),
    'best_streak',COALESCE(v_streak.best_streak,0),
    'expires_at',v_streak.expires_at,
    'cost',v_cost,
    'balance',COALESCE((SELECT fxu_balance FROM profiles WHERE id=v_user_id),0)
  );
END;
$$;
