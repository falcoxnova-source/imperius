CREATE OR REPLACE FUNCTION public.recall_deployed_fleet(p_fleet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_fleet RECORD;
  v_now timestamptz;
  v_original_flight_seconds numeric;
  v_return_time timestamptz;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_fleet
  FROM fleets
  WHERE id = p_fleet_id
  FOR UPDATE;

  IF v_fleet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada');
  END IF;

  IF v_fleet.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes retirar flotas de otros jugadores');
  END IF;

  IF v_fleet.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya completo su mision');
  END IF;

  IF v_fleet.is_returning THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya esta regresando');
  END IF;

  IF v_fleet.mission_type != 'deploy' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se pueden retirar flotas en mision de estacionamiento');
  END IF;

  v_now := now();

  -- Fleet must have already arrived (i.e. it's stationed, not in transit)
  IF v_fleet.arrival_time > v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota aun no ha llegado. Usa cancelar flota en su lugar');
  END IF;

  -- Calculate return time = same duration as original flight
  v_original_flight_seconds := EXTRACT(EPOCH FROM (v_fleet.arrival_time - v_fleet.departure_time));
  IF v_original_flight_seconds < 10 THEN
    v_original_flight_seconds := 10;
  END IF;

  v_return_time := v_now + (v_original_flight_seconds || ' seconds')::interval;

  UPDATE fleets
  SET is_returning = true,
      arrival_time = v_now,
      return_time = v_return_time
  WHERE id = p_fleet_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota retirada. Regresara en ' || CEIL(v_original_flight_seconds) || ' segundos',
    'return_seconds', CEIL(v_original_flight_seconds)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al retirar flota: ' || SQLERRM);
END;
$function$

