-- Androide IA Global: al activar, enciende la IA a todos los jugadores;
-- al desactivar, la apaga solo a quienes no la tenian antes de activarla.

CREATE TABLE IF NOT EXISTS public.android_ai_global_snapshot (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  prev_eligible boolean NOT NULL,
  prev_active boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.android_ai_global_planet_snapshot (
  planet_id uuid PRIMARY KEY REFERENCES public.planets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.android_ai_global_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.android_ai_global_planet_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.android_ai_global_snapshot FROM anon, authenticated;
REVOKE ALL ON public.android_ai_global_planet_snapshot FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_android_ai(p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_count integer := 0;
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores');
  END IF;

  UPDATE game_settings SET value = CASE WHEN p_enabled THEN 'true' ELSE 'false' END, updated_at = now() WHERE key = 'global_android_ai_enabled';

  IF p_enabled THEN
    -- Guardar estado previo de quienes NO tenian la IA
    INSERT INTO android_ai_global_snapshot (user_id, prev_eligible, prev_active)
    SELECT id, COALESCE(autopilot_eligible, false), COALESCE(autopilot_active, false)
      FROM profiles
     WHERE COALESCE(is_bot, false) = false
       AND COALESCE(is_admin, false) = false
       AND COALESCE(is_banned, false) = false
       AND NOT (COALESCE(autopilot_eligible, false) AND COALESCE(autopilot_active, false))
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO android_ai_global_planet_snapshot (planet_id)
    SELECT pl.id
      FROM planets pl
      JOIN android_ai_global_snapshot s ON s.user_id = pl.user_id
     WHERE pl.autopilot_enabled = false
    ON CONFLICT (planet_id) DO NOTHING;

    UPDATE profiles p
       SET autopilot_eligible = true,
           autopilot_active = true
      FROM android_ai_global_snapshot s
     WHERE s.user_id = p.id
       AND NOT (COALESCE(p.autopilot_eligible, false) AND COALESCE(p.autopilot_active, false));
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE planets SET autopilot_enabled = true
     WHERE id IN (SELECT planet_id FROM android_ai_global_planet_snapshot);

    PERFORM sync_android_ai_global();
  ELSE
    -- Restaurar solo a quienes se les activo con el boton global
    UPDATE profiles p
       SET autopilot_eligible = s.prev_eligible,
           autopilot_active = CASE WHEN has_active_officer(p.id, 'android') THEN p.autopilot_active ELSE s.prev_active END
      FROM android_ai_global_snapshot s
     WHERE s.user_id = p.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE planets SET autopilot_enabled = false
     WHERE id IN (SELECT planet_id FROM android_ai_global_planet_snapshot);

    DELETE FROM android_ai_global_planet_snapshot WHERE true;
    DELETE FROM android_ai_global_snapshot WHERE true;
  END IF;

  RETURN jsonb_build_object('success', true, 'enabled', p_enabled, 'affected', v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_global_android_ai_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_active integer;
BEGIN
  SELECT (value = 'true') INTO v_enabled FROM game_settings WHERE key = 'global_android_ai_enabled';
  SELECT count(*) INTO v_active FROM profiles
   WHERE COALESCE(is_bot, false) = false AND autopilot_active = true AND has_autopilot_access(id);
  RETURN jsonb_build_object('enabled', COALESCE(v_enabled, false), 'active_users', v_active);
END;
$function$;
