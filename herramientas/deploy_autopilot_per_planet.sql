SET client_encoding TO 'UTF8';

-- 1) Per-planet on/off flag. DEFAULT true preserves current behaviour (all planets active).
ALTER TABLE public.planets
  ADD COLUMN IF NOT EXISTS autopilot_enabled boolean NOT NULL DEFAULT true;

-- 2) RPC to toggle a single planet's autopilot participation.
CREATE OR REPLACE FUNCTION public.set_planet_autopilot_enabled(p_planet_id uuid, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT has_autopilot_access(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas el Oficial Androide activo o habilitacion del admin');
  END IF;

  UPDATE public.planets
  SET autopilot_enabled = p_enabled
  WHERE id = p_planet_id
    AND user_id = auth.uid()
    AND planet_type = 'planet'
    AND NOT is_destroyed;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado');
  END IF;

  RETURN jsonb_build_object('success', true, 'enabled', p_enabled);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_planet_autopilot_enabled(uuid, boolean) TO authenticated;

-- 3) Patch bot_ai_tick() to skip planets where autopilot_enabled = false.
--    Idempotent + self-validating (fails loudly if any anchor is missing).
DO $do$
DECLARE
  v_src text;
BEGIN
  v_src := pg_get_functiondef('public.bot_ai_tick()'::regprocedure)::text;
  v_src := replace(v_src, E'\r', '');

  IF position('autopilot_enabled' IN v_src) > 0 THEN
    RAISE NOTICE 'bot_ai_tick already patched for autopilot_enabled, skipping';
    RETURN;
  END IF;

  -- Anchor 1: per-planet processing loop. Skip disabled planets entirely.
  IF position($a1$      WHERE p.user_id = v_bot.id AND p.planet_type = 'planet' AND NOT p.is_destroyed
    LOOP$a1$ IN v_src) = 0 THEN
    RAISE EXCEPTION 'bot_ai_tick patch: Anchor 1 (planet loop) not found';
  END IF;
  v_src := replace(v_src,
$a1$      WHERE p.user_id = v_bot.id AND p.planet_type = 'planet' AND NOT p.is_destroyed
    LOOP$a1$,
$a1r$      WHERE p.user_id = v_bot.id AND p.planet_type = 'planet' AND NOT p.is_destroyed AND COALESCE(p.autopilot_enabled, true)
    LOOP$a1r$);

  -- Anchor 2: empire research decisor planet. Decisor must be an ENABLED planet,
  -- otherwise empire research would never be queued (it is queued inside the loop
  -- only when v_planet.id = v_empire_research_decisor_planet).
  IF position($a2$    WHERE user_id = v_bot.id AND planet_type = 'planet' AND NOT is_destroyed
    ORDER BY CASE COALESCE(autopilot_role, 'balanced')$a2$ IN v_src) = 0 THEN
    RAISE EXCEPTION 'bot_ai_tick patch: Anchor 2 (research decisor) not found';
  END IF;
  v_src := replace(v_src,
$a2$    WHERE user_id = v_bot.id AND planet_type = 'planet' AND NOT is_destroyed
    ORDER BY CASE COALESCE(autopilot_role, 'balanced')$a2$,
$a2r$    WHERE user_id = v_bot.id AND planet_type = 'planet' AND NOT is_destroyed AND COALESCE(autopilot_enabled, true)
    ORDER BY CASE COALESCE(autopilot_role, 'balanced')$a2r$);

  -- Anchor 3: "has a military planet" flag (enables vengeance phase). Only count
  -- enabled military planets.
  IF position($a3$        AND COALESCE(autopilot_role, 'balanced') = 'military'
    ) INTO v_has_military_planet;$a3$ IN v_src) = 0 THEN
    RAISE EXCEPTION 'bot_ai_tick patch: Anchor 3 (military check) not found';
  END IF;
  v_src := replace(v_src,
$a3$        AND COALESCE(autopilot_role, 'balanced') = 'military'
    ) INTO v_has_military_planet;$a3$,
$a3r$        AND COALESCE(autopilot_role, 'balanced') = 'military'
        AND COALESCE(autopilot_enabled, true)
    ) INTO v_has_military_planet;$a3r$);

  EXECUTE v_src;
  RAISE NOTICE 'bot_ai_tick patched successfully for per-planet autopilot_enabled';
END;
$do$;
