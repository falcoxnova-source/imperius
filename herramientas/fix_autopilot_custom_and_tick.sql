-- ============================================================
-- FIX: Autopilot + bot_ai_tick (VPS)
-- 1) bot_ai_tick fallaba con "relation ai_planet_custom_orders does not exist"
--    porque el rol postgres tiene un search_path corrupto y la funcion no fija
--    el suyo. Se fija search_path=public SOLO via ALTER FUNCTION (no se toca el
--    cuerpo ni el nombre de la funcion).
-- 2) El rol 'custom' (Personalizado) estaba implementado en bot_ai_tick, en la
--    tabla ai_planet_custom_orders y en los RPC save/get, pero la constraint y
--    set_planet_autopilot_role NO lo permitian, asi que no se podia activar.
--    Se agrega 'custom' a ambas listas (sin renombrar nada, sin cambiar logica).
-- ============================================================

-- 1) bot_ai_tick: fijar search_path sin alterar el cuerpo de la funcion
ALTER FUNCTION public.bot_ai_tick() SET search_path = public;

-- 2a) Permitir 'custom' en la constraint de roles de planeta
ALTER TABLE public.planets DROP CONSTRAINT IF EXISTS planets_autopilot_role_check;
ALTER TABLE public.planets
  ADD CONSTRAINT planets_autopilot_role_check
  CHECK ((autopilot_role = ANY (ARRAY['balanced'::text, 'miner'::text, 'military'::text, 'research'::text, 'colonizer'::text, 'custom'::text])));

-- 2b) Permitir 'custom' en set_planet_autopilot_role
--     (cuerpo identico al desplegado; UNICO cambio: se agrega 'custom' a la lista permitida)
CREATE OR REPLACE FUNCTION public.set_planet_autopilot_role(p_planet_id uuid, p_role text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT has_autopilot_access(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas el Oficial Androide activo o habilitación del admin');
  END IF;

  IF p_role NOT IN ('balanced', 'miner', 'military', 'research', 'colonizer', 'custom') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rol inválido');
  END IF;

  UPDATE public.planets
  SET autopilot_role = p_role
  WHERE id = p_planet_id
    AND user_id = auth.uid()
    AND planet_type = 'planet'
    AND NOT is_destroyed;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado');
  END IF;

  RETURN jsonb_build_object('success', true, 'role', p_role);
END;
$function$;
