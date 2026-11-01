-- Fase 3: ampliar roles de autopiloto
ALTER TABLE public.planets DROP CONSTRAINT IF EXISTS planets_autopilot_role_check;
ALTER TABLE public.planets
  ADD CONSTRAINT planets_autopilot_role_check
  CHECK (autopilot_role IN ('balanced','miner','military','research','colonizer'));

CREATE OR REPLACE FUNCTION public.set_planet_autopilot_role(p_planet_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT has_autopilot_access(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas el Oficial Androide activo o habilitación del admin');
  END IF;

  IF p_role NOT IN ('balanced', 'miner', 'military', 'research', 'colonizer') THEN
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
$$;
