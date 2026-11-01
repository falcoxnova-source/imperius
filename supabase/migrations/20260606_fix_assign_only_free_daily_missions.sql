-- Fix: assign_daily_missions only assigns FREE missions (cost_fxu = 0)
-- Premium missions should NOT be randomly assigned as free

CREATE OR REPLACE FUNCTION public.assign_daily_missions(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    v_today date := current_date;
    v_count integer;
    v_missions integer[];
    v_mid integer;
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_daily_missions
    WHERE user_id = p_user_id AND expires_at::date = v_today AND expires_at > now();

    IF v_count >= 3 THEN
      RETURN jsonb_build_object('success', true, 'count', v_count, 'message', 'Ya tienes misiones asignadas hoy');
    END IF;

    SELECT ARRAY_AGG(id) INTO v_missions
    FROM (
      SELECT id FROM daily_missions
      WHERE is_active = true AND (cost_fxu IS NULL OR cost_fxu = 0)
      ORDER BY random()
      LIMIT (3 - v_count)
    ) sub;

    IF v_missions IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'No hay misiones activas');
    END IF;

    FOREACH v_mid IN ARRAY v_missions
    LOOP
      INSERT INTO user_daily_missions (user_id, mission_id, progress, expires_at)
      VALUES (p_user_id, v_mid, 0, (v_today + interval '1 day')::date)
      ON CONFLICT (user_id, mission_id, expires_at) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_count + array_length(v_missions, 1));
  END;
  $function$;
