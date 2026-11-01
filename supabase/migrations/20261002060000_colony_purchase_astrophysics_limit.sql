-- [COLMKT7] El comprador de una colonia debe respetar el limite de planetas
-- de Astrofisica (misma regla que validate_fleet_mission:
-- max_planetas = 1 + FLOOR((astrofisica + 1) / 2), contando el principal).
-- Solo se inserta la comprobacion; el resto de purchase_colony_listing no cambia.
DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.purchase_colony_listing(uuid)'::regprocedure);
  v_anchor_decl text := '  v_fleets_redirected integer := 0;';
  v_anchor_body text := '  SELECT * INTO v_planet FROM planets WHERE id = v_listing.planet_id FOR UPDATE;';
  v_new text;
BEGIN
  IF position('[COLMKT7]' in v_def) > 0 THEN
    RAISE NOTICE 'COLMKT7 ya aplicado';
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, v_anchor_decl, ''))) / length(v_anchor_decl) <> 1
     OR (length(v_def) - length(replace(v_def, v_anchor_body, ''))) / length(v_anchor_body) <> 1 THEN
    RAISE EXCEPTION 'Anclas no encontradas exactamente una vez';
  END IF;

  v_new := replace(v_def, v_anchor_decl, v_anchor_decl || E'\n'
    || E'  v_buyer_planets integer;\n'
    || E'  v_astro integer;\n'
    || E'  v_max_planets integer;');

  v_new := replace(v_new, v_anchor_body,
       E'  -- [COLMKT7] Limite de planetas por Astrofisica del comprador\n'
    || E'  -- (misma regla que validate_fleet_mission). Se bloquea el perfil del\n'
    || E'  -- comprador para que dos compras simultaneas no superen el limite.\n'
    || E'  PERFORM 1 FROM profiles WHERE id = v_buyer FOR UPDATE;\n'
    || E'  SELECT COUNT(*) INTO v_buyer_planets FROM planets\n'
    || E'   WHERE user_id = v_buyer AND NOT is_destroyed AND planet_type = ''planet'';\n'
    || E'  SELECT COALESCE(MAX(ut.level), 0) INTO v_astro\n'
    || E'    FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id\n'
    || E'   WHERE ut.user_id = v_buyer AND tt.code = ''astrophysics'';\n'
    || E'  v_max_planets := 1 + FLOOR((v_astro + 1) / 2);\n'
    || E'  IF v_buyer_planets >= v_max_planets THEN\n'
    || E'    RETURN jsonb_build_object(''success'', false,\n'
    || E'      ''error'', format(''Tienes %s de %s planetas que permite tu Astrofisica nivel %s. Para obtener una colonia mas sube Astrofisica a nivel %s.'', v_buyer_planets, v_max_planets, v_astro, 2 * v_buyer_planets - 1),\n'
    || E'      ''requires_astrophysics_level'', 2 * v_buyer_planets - 1);\n'
    || E'  END IF;\n\n'
    || v_anchor_body);

  EXECUTE v_new;
END
$mig$;
