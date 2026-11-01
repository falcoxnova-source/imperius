CREATE OR REPLACE FUNCTION public.set_planet_autopilot_enabled(p_planet_id uuid, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- [COLMKT5] colonia en venta: bloqueada hasta cancelar la venta
  IF p_enabled AND public._colony_listed_since(p_planet_id) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta colonia esta en venta en el mercado. Cancela la venta para poder usarla.');
  END IF;
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
$function$

