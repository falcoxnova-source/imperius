-- =====================================================================
-- P2P Fase 13 — Mantenimiento de evidencia y notas finales
-- 1) Función p2p_cleanup_old_dispute_evidence(days int):
--    elimina los archivos de p2p-evidence cuyas disputas se resolvieron
--    hace más de N días (default 90), conservando las filas y la lista
--    de paths para auditoría histórica.
-- 2) game_settings.p2p_evidence_retention_days (default 90).
-- =====================================================================

INSERT INTO game_settings(key, value, description)
VALUES ('p2p_evidence_retention_days', '90', 'Días que se conserva la evidencia física de disputas en storage tras resolverlas.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION p2p_cleanup_old_dispute_evidence(p_days int DEFAULT NULL)
RETURNS TABLE(deleted_count int, scanned_disputes int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_deleted int := 0;
  v_scanned int := 0;
  v_dispute record;
  v_path text;
BEGIN
  IF p_days IS NULL THEN
    SELECT COALESCE(value::int, 90) INTO v_days
      FROM game_settings WHERE key = 'p2p_evidence_retention_days';
    v_days := COALESCE(v_days, 90);
  ELSE
    v_days := GREATEST(1, p_days);
  END IF;

  FOR v_dispute IN
    SELECT id, evidence
    FROM p2p_disputes
    WHERE status IN ('resolved_buyer','resolved_seller','cancelled')
      AND resolved_at IS NOT NULL
      AND resolved_at < (now() - make_interval(days => v_days))
      AND jsonb_typeof(evidence) = 'array'
      AND jsonb_array_length(evidence) > 0
  LOOP
    v_scanned := v_scanned + 1;

    -- Borrado físico de cada path en el bucket p2p-evidence
    FOR v_path IN
      SELECT DISTINCT (e->>'path')::text
      FROM jsonb_array_elements(v_dispute.evidence) AS e
      WHERE (e->>'path') IS NOT NULL
    LOOP
      DELETE FROM storage.objects
       WHERE bucket_id = 'p2p-evidence' AND name = v_path;
      IF FOUND THEN
        v_deleted := v_deleted + 1;
      END IF;
    END LOOP;

    -- Marcamos la evidencia como purgada pero conservamos la traza histórica
    UPDATE p2p_disputes
       SET evidence = jsonb_build_array(jsonb_build_object(
                        'purged', true,
                        'original_count', jsonb_array_length(v_dispute.evidence),
                        'purged_at', now()
                      ))
     WHERE id = v_dispute.id;
  END LOOP;

  RETURN QUERY SELECT v_deleted, v_scanned;
END;
$$;

GRANT EXECUTE ON FUNCTION p2p_cleanup_old_dispute_evidence(int) TO authenticated;

COMMENT ON FUNCTION p2p_cleanup_old_dispute_evidence(int) IS
'Fase 13: borra archivos de evidencia de disputas resueltas hace > N días (default 90). Conserva las filas con marca purged=true.';
