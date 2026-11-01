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

    -- [DEPLOY] Si la flota de despliegue YA llego a su destino, cancelar no debe
    -- hacerla regresar: se procesa la llegada para que las naves se queden.
    IF v_fleet.mission_type = 'deploy' AND v_fleet.arrival_time <= now() THEN
      PERFORM public.process_fleet_arrival(p_fleet_id);
      RETURN jsonb_build_object('success', false, 'error', 'La flota ya llego a su destino');
    END IF;

    -- Calculate return time = time already elapsed (same time to go back)
    v_elapsed_seconds := EXTRACT(EPOCH FROM (now() - v_fleet.departure_time));
    v_return_seconds := v_elapsed_seconds;

    -- [ACSFIX1] Si la flota forma parte de un ACS, sacarla del ataque conjunto.
    -- Sin esto el ACS quedaba fantasma: listado y con un participante sin naves.
    IF v_fleet.is_acs = true AND v_fleet.acs_id IS NOT NULL THEN
      DELETE FROM acs_participants WHERE fleet_id = p_fleet_id;

      UPDATE acs_fleets af
      SET current_participants = (
        SELECT count(*) FROM acs_participants ap WHERE ap.acs_id = af.id
      )
      WHERE af.id = v_fleet.acs_id;

      -- Si ya no queda ninguna flota, el ACS se cierra
      UPDATE acs_fleets af
      SET is_active = false, status = 'cancelled'
      WHERE af.id = v_fleet.acs_id
        AND NOT EXISTS (SELECT 1 FROM acs_participants ap WHERE ap.acs_id = af.id);
    END IF;

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

