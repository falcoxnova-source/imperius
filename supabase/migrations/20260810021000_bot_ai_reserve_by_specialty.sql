-- =====================================================================
-- FASE 14b — La reserva economica se modula por ESPECIALIDAD
-- =====================================================================
-- Tras aplicar la FASE 14 los planetas de rol 'military' dejaban de producir
-- flota por completo (toda su caja quedaba reservada para infraestructura).
-- Un veterano no hace eso con su planeta de guerra: reparte. Se deja el 40%
-- del coste del siguiente edificio reservado y el 60% restante libre para
-- naves/defensas, de modo que el planeta militar sigue creciendo Y armandose.
-- El resto de roles (balanced/miner/research/colonizer) mantienen la
-- prioridad economica total hasta que las minas maduran.
-- =====================================================================

BEGIN;

DO $mig$
DECLARE
  v_oid oid; v_def text; v_a text; v_b text; v_hits integer;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bot_ai_tick' AND p.prokind = 'f';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'public.bot_ai_tick() no existe; abortado'; END IF;

  v_def := pg_get_functiondef(v_oid);

  IF position($q$WHEN v_planet_role = 'military' THEN 0.40$q$ in v_def) > 0 THEN
    RAISE EXCEPTION 'FASE 14b ya aplicada; abortado sin cambios';
  END IF;

  v_a := $a$                v_econ_reserve_factor := CASE
                  WHEN GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl) >= 22 THEN 0.0$a$;
  v_b := $b$                v_econ_reserve_factor := CASE
                  -- [ESPECIALIDAD] El planeta de guerra reparte: 40% al ladrillo, 60% a la flota.
                  WHEN v_planet_role = 'military' THEN 0.40
                  WHEN GREATEST(v_metal_mine_lvl, v_crystal_mine_lvl) >= 22 THEN 0.0$b$;

  v_hits := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'ancla encontrada % veces (esperado 1)', v_hits; END IF;

  v_def := replace(v_def, v_a, v_b);
  EXECUTE v_def;
  RAISE NOTICE 'bot_ai_tick() actualizada (FASE 14b: reserva por especialidad).';
END
$mig$;

DO $chk$
DECLARE v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bot_ai_tick' AND p.prokind = 'f';
  IF position($q$WHEN v_planet_role = 'military' THEN 0.40$q$ in v_src) = 0 THEN
    RAISE EXCEPTION 'Verificacion FALLIDA; ROLLBACK';
  END IF;
  RAISE NOTICE 'Verificacion OK.';
END
$chk$;

COMMIT;
