-- =====================================================================
-- Dar acceso de solo-lectura al Dashboard Financiero a la cuenta
-- satoshibtcs@yahoo.com sin hacerla admin.
--
-- Cambios:
-- 1. Agregar columna can_view_financials a profiles (default false)
-- 2. Setear true para la cuenta indicada
-- 3. Crear helper has_financial_access() que retorna true si admin O viewer
-- 4. Modificar el auth check de las 10 RPCs financieras para usar ese helper
--    (no cambia nada más en la lógica de cada función)
-- =====================================================================

-- 1. Columna (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='can_view_financials') THEN
    ALTER TABLE profiles ADD COLUMN can_view_financials boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Activar para la cuenta
UPDATE profiles SET can_view_financials = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'satoshibtcs@yahoo.com' LIMIT 1);

-- 3. Helper
CREATE OR REPLACE FUNCTION public.has_financial_access()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_result boolean;
BEGIN
  SELECT (COALESCE(is_admin, false) OR COALESCE(can_view_financials, false))
  INTO v_result
  FROM profiles WHERE id = auth.uid();
  RETURN COALESCE(v_result, false);
END;
$$;

-- 4. Parchear las 10 RPCs financieras reemplazando SOLO su auth check.
--    Uso un bloque DO con execute + replace para no reescribir cada función
--    completa (las funciones pueden ser enormes y no queremos tocarlas).

DO $patch$
DECLARE
  v_fn text;
  v_def text;
  v_new text;
  v_fns text[] := ARRAY[
    'get_platform_financial_stats',
    'get_recent_revenue',
    'get_revenue_by_type',
    'get_daily_revenue',
    'get_monthly_revenue',
    'get_weekly_revenue',
    'get_revenue_summary',
    'get_p2p_economy_stats',
    'get_weekly_revenue_snapshots',
    'take_weekly_revenue_snapshot'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    -- Get full function definition
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=v_fn
    LIMIT 1;

    IF v_def IS NULL THEN
      RAISE WARNING 'Function % not found, skipping', v_fn;
      CONTINUE;
    END IF;

    v_new := v_def;

    -- Pattern 1: IF NOT is_current_user_admin() THEN
    v_new := replace(v_new, 'IF NOT is_current_user_admin() THEN', 'IF NOT has_financial_access() THEN');

    -- Pattern 2: SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    v_new := replace(v_new, 'SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;',
                             'SELECT (is_admin OR can_view_financials) INTO v_is_admin FROM profiles WHERE id = v_user_id;');

    -- Pattern 3: SELECT COALESCE(is_admin, false) INTO v_is_admin FROM profiles WHERE id = auth.uid();
    v_new := replace(v_new, 'SELECT COALESCE(is_admin, false) INTO v_is_admin',
                             'SELECT COALESCE(is_admin, false) OR COALESCE(can_view_financials, false) INTO v_is_admin');

    -- Pattern 4: SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) INTO v_is_admin;
    v_new := replace(v_new, 'SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) INTO v_is_admin;',
                             'SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_admin = true OR can_view_financials = true)
  ) INTO v_is_admin;');

    -- If nothing changed, skip
    IF v_new = v_def THEN
      RAISE WARNING 'No auth pattern matched for %, skipping', v_fn;
      CONTINUE;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'Patched: %', v_fn;
  END LOOP;
END;
$patch$;
