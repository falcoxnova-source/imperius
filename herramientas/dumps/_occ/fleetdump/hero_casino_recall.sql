CREATE OR REPLACE FUNCTION public.hero_casino_recall()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_trip record;
  v_returns timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_trip FROM public.hero_casino_trips WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe ya esta en el hangar');
  END IF;

  IF v_trip.returns_at IS NOT NULL THEN
    IF v_trip.returns_at <= now() THEN
      DELETE FROM public.hero_casino_trips WHERE user_id = v_uid;
      RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe ya esta en el hangar');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe ya esta regresando');
  END IF;

  IF now() < v_trip.arrives_at THEN
    -- Aun en vuelo: regresa en el mismo tiempo que lleva volando
    v_returns := now() + GREATEST(now() - v_trip.departed_at, interval '1 second');
  ELSE
    v_returns := now() + make_interval(secs => v_trip.flight_seconds);
  END IF;

  UPDATE public.hero_casino_trips SET returns_at = v_returns WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true, 'returns_at', v_returns);
END;
$function$

