CREATE OR REPLACE FUNCTION public.cancel_fleet(p_fleet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    v_fleet RECORD;
    v_user_id uuid;
    v_elapsed_seconds numeric;
    v_return_seconds numeric;
  BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
    END IF;

    SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada');
    END IF;

    IF v_fleet.user_id != v_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'No puedes cancelar esta flota');
    END IF;

    IF v_fleet.is_completed = true THEN
      RETURN jsonb_build_object('success', false, 'error', 'La flota ya ha llegado a su destino');
    END IF;

    IF v_fleet.is_returning = true THEN
      RETURN jsonb_build_object('success', false, 'error', 'La flota ya esta regresando');
    END IF;

    -- Calculate return time = time already elapsed (same time to go back)
    v_elapsed_seconds := EXTRACT(EPOCH FROM (now() - v_fleet.departure_time));
    v_return_seconds := v_elapsed_seconds;

    -- Set fleet as returning with proper return time
    UPDATE fleets 
    SET is_returning = true,
        return_time = now() + (v_return_seconds || ' seconds')::interval
    WHERE id = p_fleet_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Flota regresando. Llegara en ' || ROUND(v_return_seconds / 60) || ' minutos.',
      'return_time', now() + (v_return_seconds || ' seconds')::interval
    );
  END;
  $function$

