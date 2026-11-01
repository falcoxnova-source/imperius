CREATE OR REPLACE FUNCTION public.apply_vip_time_bonus(p_user_id uuid, p_seconds integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mult numeric;
BEGIN
  IF p_seconds IS NULL OR p_user_id IS NULL THEN
    RETURN p_seconds;
  END IF;
  IF NOT public.is_user_plus(p_user_id) THEN
    RETURN p_seconds;
  END IF;
  v_mult := public.get_vip_time_speed_multiplier();
  IF v_mult IS NULL OR v_mult <= 1 THEN
    RETURN p_seconds;
  END IF;
  RETURN GREATEST(1, FLOOR(p_seconds::numeric / v_mult))::integer;
END;
$function$

