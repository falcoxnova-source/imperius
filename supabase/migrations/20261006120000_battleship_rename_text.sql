-- [BATTLESHIP3] Texto visible: "Batalla Naval" -> "Batalla de Naves" en mensajes de funciones.
SET lock_timeout = '5s';
DO $patch$
DECLARE
  r record;
  v_src text;
  v_new text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosrc LIKE '%Batalla Naval%'
  LOOP
    v_src := pg_get_functiondef(r.oid);
    v_new := replace(v_src, 'Batalla Naval', 'Batalla de Naves');
    IF v_new <> v_src THEN
      EXECUTE v_new;
      n := n + 1;
      RAISE NOTICE 'patched %', r.oid::regprocedure;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prosrc LIKE '%Batalla Naval%'
  ) THEN
    RAISE EXCEPTION 'quedan funciones con Batalla Naval';
  END IF;
  RAISE NOTICE 'total patched: %', n;
END
$patch$;
