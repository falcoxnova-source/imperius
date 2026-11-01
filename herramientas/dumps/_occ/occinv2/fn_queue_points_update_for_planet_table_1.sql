CREATE OR REPLACE FUNCTION public.queue_points_update_for_planet_table()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = OLD.planet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM public.planets WHERE id = NEW.planet_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.points_update_queue (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$

