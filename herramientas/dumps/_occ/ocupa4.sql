-- [OCUPA4] Limite de ocupaciones: sin tope global, maximo 3 colonias ocupadas por cada jugador victima.
DO $do$
DECLARE
  v_def text;
  v_new text;
  v_oid oid;
BEGIN
  -- 1) _occ_try_start: conteo por (ocupante, dueno) + lock anti-carrera
  v_oid := 'public._occ_try_start(uuid,uuid,numeric,numeric,numeric)'::regprocedure;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  IF position('[OCUPA4]' in v_def) > 0 THEN
    RAISE NOTICE '_occ_try_start ya parcheado';
  ELSE
    v_new := replace(v_def,
      $a$    WHEN (SELECT count(*) FROM public.occupations WHERE occupier_id = f.user_id AND status = 'active') >= 3$a$,
      $b$    WHEN (SELECT count(*) FROM public.occupations WHERE occupier_id = f.user_id AND owner_id = p.user_id AND status = 'active') >= 3 -- [OCUPA4]$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor count no encontrado'; END IF;
    v_def := v_new;
    v_new := replace(v_def,
      $a$      THEN 'Ya tienes el máximo de 3 ocupaciones activas.'$a$,
      $b$      THEN 'Ya tienes ocupadas 3 colonias de este jugador (máximo 3 por jugador).'$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor msg no encontrado'; END IF;
    v_def := v_new;
    v_new := replace(v_def,
      $a$  v_others := v_others - 1;$a$,
      $b$  v_others := v_others - 1;
  IF p.user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('occ4:' || f.user_id::text || ':' || p.user_id::text)); -- [OCUPA4]
  END IF;$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor lock no encontrado'; END IF;
    EXECUTE v_new;
  END IF;

  -- 2) get_occupation_ship_info
  v_oid := 'public.get_occupation_ship_info()'::regprocedure;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  IF position('[OCUPA4]' in v_def) = 0 THEN
    v_new := replace(v_def,
      $a$    'max_active_occupations', 3,$a$,
      $b$    'max_active_occupations', NULL, 'max_per_player', 3, -- [OCUPA4]$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor ship_info no encontrado'; END IF;
    EXECUTE v_new;
  END IF;

  -- 3) get_occupation_overview
  v_oid := 'public.get_occupation_overview()'::regprocedure;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  IF position('[OCUPA4]' in v_def) = 0 THEN
    v_new := replace(v_def,
      $a$'as_owner', v_own, 'max_active', 3);$a$,
      $b$'as_owner', v_own, 'max_active', NULL, 'max_per_player', 3); -- [OCUPA4]$b$);
    IF v_new = v_def THEN RAISE EXCEPTION 'anchor overview no encontrado'; END IF;
    EXECUTE v_new;
  END IF;
END
$do$;
