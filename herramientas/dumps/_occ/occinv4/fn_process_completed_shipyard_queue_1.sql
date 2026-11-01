CREATE OR REPLACE FUNCTION public.process_completed_shipyard_queue(p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_total integer;
BEGIN
  SELECT user_id INTO v_owner FROM planets WHERE id = p_planet_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  v_total := public.process_shipyard_queue_core(p_planet_id);

  RETURN jsonb_build_object('success', true, 'completed_units', v_total);
END;
$function$

