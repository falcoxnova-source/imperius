-- Fase 7: Observabilidad del autopiloto
CREATE TABLE IF NOT EXISTS public.autopilot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planet_id uuid REFERENCES public.planets(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_events_user_created
  ON public.autopilot_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopilot_events_planet_created
  ON public.autopilot_events (planet_id, created_at DESC);

ALTER TABLE public.autopilot_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS autopilot_events_select_own ON public.autopilot_events;
CREATE POLICY autopilot_events_select_own
  ON public.autopilot_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RPC para leer eventos recientes
CREATE OR REPLACE FUNCTION public.get_autopilot_events(p_planet_id uuid DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(e)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      ev.id,
      ev.planet_id,
      p.name AS planet_name,
      ev.event_type,
      ev.payload,
      ev.created_at
    FROM public.autopilot_events ev
    LEFT JOIN public.planets p ON p.id = ev.planet_id
    WHERE ev.user_id = auth.uid()
      AND (p_planet_id IS NULL OR ev.planet_id = p_planet_id)
    ORDER BY ev.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  ) e;

  RETURN jsonb_build_object('success', true, 'events', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_autopilot_events(uuid, integer) TO authenticated;

-- Helper para que bot_ai_tick registre eventos (SECURITY DEFINER porque lo llama el cron)
CREATE OR REPLACE FUNCTION public.log_autopilot_event(
  p_user_id uuid,
  p_planet_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.autopilot_events (user_id, planet_id, event_type, payload)
  VALUES (p_user_id, p_planet_id, p_event_type, COALESCE(p_payload, '{}'::jsonb));

  -- Mantener tabla acotada: borrar eventos de más de 7 días o >500 por usuario
  DELETE FROM public.autopilot_events
  WHERE user_id = p_user_id
    AND created_at < now() - interval '7 days';

  DELETE FROM public.autopilot_events
  WHERE id IN (
    SELECT id FROM public.autopilot_events
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    OFFSET 500
  );
END;
$$;

-- Fase 8: Monetización - boost VIP (procesa al jugador cada tick sin esperar 5min de inactividad)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS autopilot_vip_boost boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.toggle_autopilot_vip_boost(p_enable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_access boolean;
  v_cost numeric := 0;
  v_balance numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT has_autopilot_access(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas el Oficial Androide o habilitación del admin');
  END IF;

  -- Si activa: cobrar 5000 FXU por sesión (se desactiva cuando el jugador interactúa)
  IF p_enable THEN
    SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM public.profiles WHERE id = auth.uid();
    v_cost := 5000;
    IF v_balance < v_cost THEN
      RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente (se requieren 5000 FXU)');
    END IF;
    UPDATE public.profiles
    SET fxu_balance = fxu_balance - v_cost,
        autopilot_vip_boost = true
    WHERE id = auth.uid();
  ELSE
    UPDATE public.profiles
    SET autopilot_vip_boost = false
    WHERE id = auth.uid();
  END IF;

  RETURN jsonb_build_object('success', true, 'active', p_enable, 'cost', v_cost);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_autopilot_vip_boost(boolean) TO authenticated;
