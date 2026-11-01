-- [COLMKT8] Comprar colonias en el mercado ya NO depende de Astrofisica.
-- El comprador puede tener todos los planetas comprados que quiera.
-- Colonizar sigue limitado: validate_fleet_mission y process_fleet_arrival
-- cuentan TODOS los planetas (incluidos los comprados) contra
-- 1 + FLOOR((astrofisica + 1) / 2), asi que si se pasa del limite no puede
-- colonizar hasta subir Astrofisica.
DO $mig$
DECLARE
  v_oid oid := 'public.purchase_colony_listing(uuid)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_ini int;
  v_fin int;
  c_ini constant text := '  -- [COLMKT7] Limite de planetas por Astrofisica del comprador';
  c_fin constant text := '  SELECT * INTO v_planet FROM planets WHERE id = v_listing.planet_id FOR UPDATE;';
BEGIN
  IF strpos(v_def, '[COLMKT8]') > 0 THEN
    RAISE NOTICE 'COLMKT8 ya aplicado';
    RETURN;
  END IF;
  v_ini := strpos(v_def, c_ini);
  v_fin := strpos(v_def, c_fin);
  IF v_ini = 0 OR v_fin = 0 OR v_fin < v_ini THEN
    RAISE EXCEPTION 'No se encontro el bloque COLMKT7 en purchase_colony_listing';
  END IF;
  v_def := substr(v_def, 1, v_ini - 1)
        || E'  -- [COLMKT8] Sin limite de Astrofisica para comprar colonias (colonizar si lo valida)\n\n'
        || substr(v_def, v_fin);
  EXECUTE v_def;
END
$mig$;
