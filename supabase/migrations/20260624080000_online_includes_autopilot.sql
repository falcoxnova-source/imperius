-- =====================================================================
-- Contar como "en linea" tambien a las cuentas con piloto automatico activo
-- (ademas de las que tienen actividad reciente). Solo afecta el contador
-- online del header; no toca la deteccion de inactividad/purga.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_online_players_count()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM profiles
  WHERE (last_activity > now() - interval '5 minutes' OR autopilot_active = true)
    AND is_banned = false;

  RETURN jsonb_build_object('online', v_count);
END;
$function$;
