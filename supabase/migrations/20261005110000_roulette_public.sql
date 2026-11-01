-- [ROULETTE2] Ruleta abierta a todos los jugadores (se quita la allowlist).
-- casino_roulette_admin sigue restringido a administradores.
BEGIN;

DO $mig$
DECLARE
  c_anchor constant text := 'IF NOT EXISTS (SELECT 1 FROM public.hero_access_allowlist WHERE user_id = v_uid) THEN';
  v_fn  regprocedure;
  v_def text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.casino_roulette_spin(jsonb)'::regprocedure,
                              'public.casino_roulette_status()'::regprocedure] LOOP
    v_def := pg_get_functiondef(v_fn);
    IF position(c_anchor in v_def) = 0 THEN
      RAISE EXCEPTION 'anchor not found in %', v_fn;
    END IF;
    EXECUTE replace(v_def, c_anchor, 'IF false THEN  -- [ROULETTE2] abierta a todos');
  END LOOP;
END
$mig$;

COMMIT;
