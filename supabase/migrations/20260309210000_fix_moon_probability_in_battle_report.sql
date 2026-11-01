/*
  # Fix moon probability % missing in battle reports

  ## Problem
  process_fleet_arrival only sets v_moon_text when moon_created = true.
  When the moon is NOT created (99% of cases), v_moon_text stays empty
  and the battle report shows no probability %.

  ## Fix
  Add ELSIF branch so that when moon is NOT created but v_moon_result
  exists, the report shows "Probabilidad de luna: X% - No se formo
  ninguna luna."

  ## Scope
  Only patches process_fleet_arrival: adds ELSIF before END IF.
  No schema, table, column, or other function changes.
*/

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival'
    AND pronargs = 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'process_fleet_arrival not found, skipping';
    RETURN;
  END IF;

  -- Anchor: the unique moon_chance line followed by END IF
  -- (moon_chance only appears once in the function)
  v_src := replace(v_src,
    '(v_moon_result->>''moon_chance'')::numeric);' || chr(10) || 'END IF;',
    '(v_moon_result->>''moon_chance'')::numeric);' || chr(10) ||
    'ELSIF v_moon_result IS NOT NULL THEN' || chr(10) ||
    'v_moon_text := format(E''\nProbabilidad de luna: %s%% - No se formo ninguna luna.'',' || chr(10) ||
    'ROUND(COALESCE((v_moon_result->>''moon_chance'')::numeric, 0), 1));' || chr(10) ||
    'END IF;');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) '
    'RETURNS void LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = public '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'process_fleet_arrival: battle reports now show moon probability when moon is NOT created';
END $$;
