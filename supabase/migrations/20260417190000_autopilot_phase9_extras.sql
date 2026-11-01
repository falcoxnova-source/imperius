-- Fase 9a: VIP Boost expirable (24h) + stats RPC

-- 1) Columna de expiración del VIP Boost
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS autopilot_vip_boost_expires_at timestamptz;

-- 2) Reescribir toggle para grabar expiración
CREATE OR REPLACE FUNCTION public.toggle_autopilot_vip_boost(p_enable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric := 0;
  v_balance numeric;
  v_expires timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT has_autopilot_access(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas el Oficial Androide o habilitación del admin');
  END IF;

  IF p_enable THEN
    SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM public.profiles WHERE id = auth.uid();
    v_cost := 5000;
    IF v_balance < v_cost THEN
      RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente (se requieren 5000 FXU)');
    END IF;
    v_expires := now() + interval '24 hours';
    UPDATE public.profiles
    SET fxu_balance = fxu_balance - v_cost,
        autopilot_vip_boost = true,
        autopilot_vip_boost_expires_at = v_expires
    WHERE id = auth.uid();
  ELSE
    UPDATE public.profiles
    SET autopilot_vip_boost = false,
        autopilot_vip_boost_expires_at = NULL
    WHERE id = auth.uid();
    v_expires := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'active', p_enable,
    'cost', v_cost,
    'expires_at', v_expires
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_autopilot_vip_boost(boolean) TO authenticated;

-- 3) RPC de estadísticas agregadas últimas 24 h
CREATE OR REPLACE FUNCTION public.get_autopilot_stats(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats jsonb;
  v_window integer := GREATEST(1, LEAST(p_hours, 168));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT COALESCE(jsonb_object_agg(event_type, total), '{}'::jsonb)
  INTO v_stats
  FROM (
    SELECT event_type, COUNT(*)::int AS total
    FROM public.autopilot_events
    WHERE user_id = auth.uid()
      AND created_at >= now() - make_interval(hours => v_window)
    GROUP BY event_type
  ) s;

  RETURN jsonb_build_object('success', true, 'hours', v_window, 'stats', v_stats);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_autopilot_stats(integer) TO authenticated;

-- 4) Permitir que el front se suscriba vía Realtime (ya cubierto por RLS select_own)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'autopilot_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.autopilot_events';
  END IF;
END$$;
