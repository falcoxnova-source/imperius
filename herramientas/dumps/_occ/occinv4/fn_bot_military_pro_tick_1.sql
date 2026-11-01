CREATE OR REPLACE FUNCTION public.bot_military_pro_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 30% chance each behavior per tick (avoids spam, hits ~every 3-4 ticks)
  IF random() < 0.30 THEN PERFORM bot_launch_ipm_attacks(); END IF;
  IF random() < 0.30 THEN PERFORM bot_farm_inactive_players(); END IF;
  IF random() < 0.30 THEN PERFORM bot_use_sensor_phalanx(); END IF;
END;
$function$

