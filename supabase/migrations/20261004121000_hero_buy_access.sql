-- [HEROAUDIT1b] buy_hero_item_listing: exigir acceso a Nave Heroe (igual que create_hero_item_listing)
DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.buy_hero_item_listing(uuid)'::regprocedure);
  v_anchor text := 'SELECT * INTO v_listing';
BEGIN
  IF position('_hero_has_access' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'anchor not unique/missing in buy_hero_item_listing';
  END IF;
  v_def := replace(v_def, v_anchor,
    E'IF NOT public._hero_has_access(v_user_id) THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''Sin acceso a la Nave Heroe'');\n  END IF;\n\n  ' || v_anchor);
  EXECUTE v_def;
END
$mig$;

REVOKE ALL ON FUNCTION public.buy_hero_item_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_hero_item_listing(uuid) TO authenticated, service_role;
