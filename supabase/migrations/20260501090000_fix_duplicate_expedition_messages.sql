/*
  # Fix duplicate expedition messages

  ## Problem
  Each expedition mission was generating TWO inbox messages:
  1. A rich, detailed report from `process_expedition` (rewards, event type,
     pool bonus, etc.).
  2. A second generic "Reporte de Expedicion" inserted by
     `process_fleet_arrival` after calling `process_expedition`. This second
     INSERT used `v_expedition_result->>'message'`, but `process_expedition`
     never returns a `message` key, so the COALESCE fallback always produced
     the noise text "La expedicion no encontro nada interesante.".

  Result: every expedition delivered 2 messages (extra DB writes, extra
  realtime payload, extra storage, extra noise for the player).

  ## Fix
  In-place text-patch the `WHEN 'expedition'` branch of
  `process_fleet_arrival` to remove the redundant INSERT, keeping only the
  call to `process_expedition` and the `is_returning = true` update.
*/

DO $patch$
DECLARE
  v_old_def text;
  v_new_def text;
  v_old_block text;
  v_new_block text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_old_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'process_fleet_arrival';

  IF v_old_def IS NULL THEN
    RAISE EXCEPTION 'process_fleet_arrival not found';
  END IF;

  v_old_block :=
    E'WHEN ''expedition'' THEN\r\n'
    || E'v_expedition_result := process_expedition(p_fleet_id);\r\n'
    || E'v_expedition_message := COALESCE(v_expedition_result->>''message'', ''La expedicion no encontro nada interesante.'');\r\n'
    || E'\r\n'
    || E'INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)\r\n'
    || E'VALUES (NULL, fleet_record.user_id, ''Reporte de Expedicion'', v_expedition_message, ''expedition'');\r\n'
    || E'\r\n'
    || E'UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;';

  v_new_block :=
    E'WHEN ''expedition'' THEN\r\n'
    || E'-- process_expedition already inserts the detailed inbox message.\r\n'
    || E'-- Do NOT insert a second generic message here (was causing duplicates).\r\n'
    || E'v_expedition_result := process_expedition(p_fleet_id);\r\n'
    || E'\r\n'
    || E'UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;';

  IF position(v_old_block in v_old_def) = 0 THEN
    -- Already patched (or block not present). Verify idempotently below.
    IF v_old_def LIKE '%''Reporte de Expedicion''%' THEN
      RAISE EXCEPTION 'Target expedition block not found verbatim, but duplicate INSERT still present - manual review required.';
    END IF;
    RAISE NOTICE 'process_fleet_arrival already patched - skipping.';
    RETURN;
  END IF;

  v_new_def := replace(v_old_def, v_old_block, v_new_block);

  EXECUTE v_new_def;
  RAISE NOTICE 'process_fleet_arrival patched: duplicate expedition INSERT removed.';
END
$patch$;

-- Sanity check
DO $check$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'process_fleet_arrival';

  IF v_def LIKE '%''Reporte de Expedicion''%' THEN
    RAISE EXCEPTION 'process_fleet_arrival still contains the duplicate expedition INSERT';
  END IF;
END
$check$;
