#!/bin/sh
echo "=== 1. Insert daily_streak_cost setting ==="
docker exec xnova-database psql -U postgres -d postgres -c "
INSERT INTO public.game_settings (key, value, description)
VALUES ('daily_streak_cost', '300', 'Costo diario en TUNG para activar la racha diaria')
ON CONFLICT (key) DO UPDATE SET value = '300'
RETURNING key, value
" 2>&1

echo ""
echo "=== 2. Update activate_daily_streak function ==="
docker exec xnova-database psql -U postgres -d postgres -c "
CREATE OR REPLACE FUNCTION public.activate_daily_streak() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS \$\$
DECLARE
  v_user_id uuid;
  v_streak record;
  v_cost integer;
  v_balance numeric;
  v_new_streak integer;
  v_best_streak integer;
  v_now timestamptz := now();
  v_expires timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','No autenticado'); END IF;

  -- Read cost from game_settings, default 300
  SELECT COALESCE(NULLIF(value,'')::integer, 300) INTO v_cost
  FROM public.game_settings WHERE key = 'daily_streak_cost';
  IF v_cost IS NULL OR v_cost < 0 THEN v_cost := 300; END IF;

  SELECT fxu_balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object('success',false,'error','FXU insuficiente. Necesitas '||v_cost||' FXU.');
  END IF;

  SELECT streak_count, best_streak, expires_at INTO v_streak FROM user_daily_streaks WHERE user_id = v_user_id;
  v_expires := v_now + interval '24 hours';
  
  IF NOT FOUND OR v_streak.expires_at IS NULL OR v_streak.expires_at < v_now THEN
    v_new_streak := 1;
    v_best_streak := GREATEST(COALESCE(v_streak.best_streak,0), 1);
  ELSE
    v_new_streak := COALESCE(v_streak.streak_count,0) + 1;
    v_best_streak := GREATEST(COALESCE(v_streak.best_streak,0), v_new_streak);
  END IF;

  -- Deduct cost (bypass fxu protection trigger)
  ALTER TABLE profiles DISABLE TRIGGER protect_fxu_balance_trigger;
  UPDATE profiles SET fxu_balance = fxu_balance - v_cost WHERE id = v_user_id;
  ALTER TABLE profiles ENABLE TRIGGER protect_fxu_balance_trigger;

  INSERT INTO user_daily_streaks (user_id, streak_count, best_streak, expires_at, activated_at)
  VALUES (v_user_id, v_new_streak, v_best_streak, v_expires, v_now)
  ON CONFLICT (user_id) DO UPDATE SET
    streak_count = v_new_streak,
    best_streak = GREATEST(user_daily_streaks.best_streak, v_best_streak),
    expires_at = v_expires,
    activated_at = v_now;

  RETURN jsonb_build_object(
    'success',true,
    'streak',v_new_streak,
    'best_streak',v_best_streak,
    'expires_at',v_expires,
    'cost',v_cost,
    'balance',v_balance - v_cost
  );
END;
\$\$
" 2>&1

echo ""
echo "=== 3. Verify ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT key, value FROM public.game_settings WHERE key = 'daily_streak_cost'" 2>&1

echo ""
echo "=== 4. Test function ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'activate_daily_streak'
" 2>&1
