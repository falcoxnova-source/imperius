/*
  # Deploy: acelerar solo cobra la ida

  ## Problema
  Deploy es una misión donde las naves se QUEDAN en el destino (no regresan).
  Pero el costo de aceleración se calculaba como si hubiera viaje de vuelta.
  Los jugadores pagaban por un viaje que nunca iba a ocurrir.

  ## Solución
  Para misiones de tipo 'deploy' que no están retornando:
  - Cobrar solo el tiempo restante de la IDA (arrival_time - now)
  
  Las demás misiones siguen igual:
  - Ida (attack, transport, etc): costo = duración vuelta completa
  - Vuelta (is_returning=true): costo = tiempo restante de vuelta
*/

CREATE OR REPLACE FUNCTION calculate_fxu_cost_fleet(p_fleet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet fleets%ROWTYPE;
  v_seconds_remaining numeric;
  v_minutes_remaining numeric;
  v_ratio numeric;
  v_cost numeric;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;

  IF v_fleet IS NULL OR v_fleet.is_completed THEN
    RETURN 0;
  END IF;

  IF v_fleet.is_returning THEN
    -- Returning: cost = remaining time to get home (unchanged)
    v_seconds_remaining := EXTRACT(EPOCH FROM (v_fleet.return_time - now()));
  ELSIF v_fleet.mission_type = 'deploy' THEN
    -- Deploy (outbound): cost = remaining time of outbound trip only
    -- Ships stay at destination, no return trip to charge for
    v_seconds_remaining := EXTRACT(EPOCH FROM (v_fleet.arrival_time - now()));
  ELSE
    -- Other outbound missions: cost = full return trip duration (unchanged)
    v_seconds_remaining := EXTRACT(EPOCH FROM (v_fleet.return_time - v_fleet.arrival_time));
  END IF;

  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;

  v_minutes_remaining := v_seconds_remaining / 60.0;

  SELECT COALESCE(value::numeric, 1) INTO v_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_fleet';

  IF v_ratio <= 0 THEN
    v_ratio := 1;
  END IF;

  v_cost := v_minutes_remaining * v_ratio;

  RETURN GREATEST(1, CEIL(v_cost))::integer;
END;
$$;
