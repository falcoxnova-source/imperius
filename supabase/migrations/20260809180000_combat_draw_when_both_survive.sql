-- =====================================================================
-- Combate: EMPATE cuando ambos bandos conservan unidades tras 6 rondas
-- =====================================================================
-- Antes: si tras las 6 rondas ambos bandos conservaban unidades, el
-- resultado se decidia por VALOR de flota restante (margen del 10%),
-- de modo que el defensor podia perder (y ser saqueado) aun teniendo
-- naves y defensas vivas.
--
-- Ahora (regla clasica): solo hay vencedor por aniquilacion. Si ambos
-- bandos conservan unidades el resultado es 'draw' => sin saqueo
-- (process_fleet_arrival solo saquea con result = 'attacker_won').
--
-- Se aplica por sustitucion sobre la definicion viva de la funcion
-- (pg_get_functiondef + CREATE OR REPLACE con la MISMA firma), asi no
-- se duplica la funcion ni se reescribe el resto de su codigo.
-- Es idempotente: si el bloque ya no existe, aborta sin tocar nada.
-- =====================================================================

BEGIN;

DO $mig$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_pat text := $pat$ELSE\s*--\s*Ambos bandos conservan naves tras 6 rondas.*?v_result\s*:=\s*'draw';\s*END IF;$pat$;
  v_rep text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'simulate_xnova_combat';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'public.simulate_xnova_combat no existe; abortado';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF v_def !~ v_pat THEN
    RAISE EXCEPTION 'No se encontro el bloque de desempate por valor; abortado sin cambios';
  END IF;

  v_rep := 'ELSE' || chr(10)
        || '    -- Ambos bandos conservan unidades tras 6 rondas: EMPATE (no hay saqueo).' || chr(10)
        || '    v_result := ''draw'';';

  v_new := regexp_replace(v_def, v_pat, v_rep);

  IF v_new = v_def THEN
    RAISE EXCEPTION 'La sustitucion no produjo cambios; abortado';
  END IF;

  EXECUTE v_new;

  RAISE NOTICE 'simulate_xnova_combat actualizada: empate si ambos bandos sobreviven';
END
$mig$;

-- Verificacion dentro de la misma transaccion
DO $chk$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'simulate_xnova_combat';

  IF v_src LIKE '%v_attacker_power >= v_defender_power%'
     OR v_src LIKE '%v_defender_power >= v_attacker_power%' THEN
    RAISE EXCEPTION 'El desempate por valor sigue presente; rollback';
  END IF;

  IF v_src NOT LIKE '%EMPATE (no hay saqueo)%' THEN
    RAISE EXCEPTION 'No se aplico el nuevo bloque; rollback';
  END IF;

  RAISE NOTICE 'Verificacion OK';
END
$chk$;

COMMIT;
