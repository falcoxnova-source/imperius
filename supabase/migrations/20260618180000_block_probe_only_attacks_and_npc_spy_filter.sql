-- ============================================================================
-- [NPC/AI + PROBES]
-- 1) Bloquear ataques con solo sondas de espionaje (las sondas no pueden atacar)
-- 2) La logica del filtro NPC (no espiar novatos ni superiores) ya se aplico
--    en bot_ai_tick (scripts/_bot_ai_tick_current.sql -> Phase E)
--
-- Este patch re-inyecta el bloqueo de ataque-solo-sondas que se perdio
-- despues de recrear secure_send_fleet en migraciones posteriores.
-- ============================================================================

DO $$
DECLARE
  v_full_src text;
  v_new_src text;
  v_anchor text;
  v_injected_block text;
  v_args text;
  v_create_stmt text;
BEGIN
  SELECT prosrc INTO v_full_src FROM pg_proc
  WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ORDER BY oid DESC LIMIT 1;

  IF v_full_src IS NULL THEN
    RAISE EXCEPTION 'secure_send_fleet not found';
  END IF;

  -- Si ya esta parcheado, no hacer nada
  IF position('No puedes atacar solo con sondas' IN v_full_src) > 0 THEN
    RAISE NOTICE 'secure_send_fleet: probe-only attack block already present, skipping';
    RETURN;
  END IF;

  -- Anchor: justo despues de obtener v_probe_type_id y antes del primer IF p_mission_type
  v_anchor := 'SELECT id INTO v_probe_type_id FROM ship_types WHERE code = ''espionage_probe'';';

  IF position(v_anchor IN v_full_src) = 0 THEN
    RAISE EXCEPTION 'Could not find anchor for probe-only attack block';
  END IF;

  v_injected_block := v_anchor || E'\n\n' ||
    '  -- [BLOCK PROBE-ONLY ATTACKS] Las sondas de espionaje SOLO sirven para espiar, no pueden atacar' || E'\n' ||
    '  IF p_mission_type = ''attack'' THEN' || E'\n' ||
    '    PERFORM 1 FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)' || E'\n' ||
    '    WHERE x.quantity > 0 AND x.ship_type_id != v_probe_type_id;' || E'\n' ||
    '    IF NOT FOUND THEN' || E'\n' ||
    '      RETURN jsonb_build_object(''success'', false, ''error'', ''No puedes atacar solo con sondas de espionaje. Las sondas solo sirven para espiar.'');' || E'\n' ||
    '    END IF;' || E'\n' ||
    '  END IF;' || E'\n';

  v_new_src := replace(v_full_src, v_anchor, v_injected_block);

  IF v_new_src = v_full_src THEN
    RAISE EXCEPTION 'Source not modified after replace';
  END IF;

  -- Obtener firma exacta (con defaults) del secure_send_fleet existente
  SELECT pg_get_function_arguments(p.oid) INTO v_args
  FROM pg_proc p
  WHERE p.proname = 'secure_send_fleet'
    AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ORDER BY p.oid DESC LIMIT 1;

  v_create_stmt :=
    'CREATE OR REPLACE FUNCTION public.secure_send_fleet(' || v_args || ')' ||
    ' RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$' ||
    v_new_src ||
    '$fn$;';

  EXECUTE v_create_stmt;

  RAISE NOTICE '✅ secure_send_fleet patched: probe-only attacks blocked';
END $$;
