-- [ROULETTE3] Apuesta minima de la ruleta: 10 -> 1 TUNG (fichas 1/5/10/50/100).
BEGIN;

DO $mig$
DECLARE
  v_fn  regprocedure;
  v_def text;
  c_a1 constant text := 'c_min_bet         constant numeric := 10;';
  c_a2 constant text := '''min_bet'', 10,';
BEGIN
  v_fn := 'public.casino_roulette_spin(jsonb)'::regprocedure;
  v_def := pg_get_functiondef(v_fn);
  IF position(c_a1 in v_def) = 0 THEN
    RAISE EXCEPTION 'anchor not found in %', v_fn;
  END IF;
  EXECUTE replace(v_def, c_a1, 'c_min_bet         constant numeric := 1;  -- [ROULETTE3]');

  v_fn := 'public.casino_roulette_status()'::regprocedure;
  v_def := pg_get_functiondef(v_fn);
  IF position(c_a2 in v_def) = 0 THEN
    RAISE EXCEPTION 'anchor not found in %', v_fn;
  END IF;
  EXECUTE replace(v_def, c_a2, '''min_bet'', 1,  -- [ROULETTE3]');
END
$mig$;

COMMIT;
