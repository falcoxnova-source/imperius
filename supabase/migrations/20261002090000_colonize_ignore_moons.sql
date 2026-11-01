-- Las lunas NO cuentan como colonia para el limite de Astrofisica.
-- validate_fleet_mission ya filtraba planet_type = 'planet', pero
-- process_fleet_arrival (llegada de colonizacion) contaba tambien lunas
-- y devolvia la flota. Patch minimo por reemplazo de ancla; ACL intacta.
DO $mig$
DECLARE
  v_def text;
  v_old text := 'SELECT COUNT(*) INTO v_current_colonies FROM planets WHERE user_id = fleet_record.user_id AND NOT is_destroyed;';
  v_new text := 'SELECT COUNT(*) INTO v_current_colonies FROM planets WHERE user_id = fleet_record.user_id AND NOT is_destroyed AND planet_type = ''planet'';';
  v_hits int;
BEGIN
  v_def := pg_get_functiondef('public.process_fleet_arrival(uuid)'::regprocedure);
  IF position(v_new in v_def) > 0 THEN
    RAISE NOTICE 'ya aplicado';
    RETURN;
  END IF;
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'ancla encontrada % veces (esperado 1)', v_hits;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;
