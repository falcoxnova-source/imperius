-- OCUPA6: si un tercero destruye la guarnicion, la colonia vuelve a su dueno
-- (el atacante no puede ocuparla en esa misma batalla).
DO $do$
DECLARE
  v_oid oid;
  v_src text;
  v_anchor text := E'    WHEN EXISTS (SELECT 1 FROM public.occupations WHERE planet_id = p.id AND status = \'active\')\n';
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = '_occ_try_start' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'OCUPA6: se esperaba una sola _occ_try_start';
  END IF;
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = '_occ_try_start' AND pronamespace = 'public'::regnamespace;
  v_src := replace(pg_get_functiondef(v_oid), chr(13), '');
  IF position('[OCUPA6]' in v_src) > 0 THEN
    RAISE NOTICE 'OCUPA6 ya aplicado';
    RETURN;
  END IF;
  IF position(v_anchor in v_src) = 0 THEN
    RAISE EXCEPTION 'OCUPA6: ancla no encontrada';
  END IF;
  v_src := replace(v_src, v_anchor,
    E'    WHEN EXISTS (SELECT 1 FROM public.occupations WHERE planet_id = p.id AND status = \'ended\' AND ended_at = now()) -- [OCUPA6]\n'
    || E'      THEN \'La guarnición del ocupante fue destruida y la colonia vuelve a su dueño.\'\n'
    || v_anchor);
  EXECUTE v_src;
END
$do$;
