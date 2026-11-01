-- =====================================================================
-- Reportes de batalla detallados (v2)
-- Helper: convierte los arrays initial/remaining del simulador de combate
-- en una lista compacta [{name, code, initial, lost, remaining}]
-- Usa el mismo emparejamiento por indice + fallback por code que
-- format_unit_report(), asi que NO cambia ninguna logica de combate.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.battle_units_diff(
  p_initial jsonb,
  p_remaining jsonb,
  p_filter text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_unit jsonb;
  v_rem jsonb;
  v_idx integer := 0;
  v_init_qty integer;
  v_rem_qty integer;
  v_is_def boolean;
BEGIN
  IF p_initial IS NULL OR jsonb_typeof(p_initial) <> 'array' OR jsonb_array_length(p_initial) = 0 THEN
    RETURN v_out;
  END IF;

  FOR v_unit IN SELECT * FROM jsonb_array_elements(p_initial)
  LOOP
    v_is_def := COALESCE((v_unit->>'is_defense')::boolean, false);
    v_init_qty := COALESCE((v_unit->>'initial_quantity')::integer, (v_unit->>'quantity')::integer, 0);

    IF v_init_qty > 0 AND (
         p_filter = 'all'
         OR (p_filter = 'ships' AND NOT v_is_def)
         OR (p_filter = 'defenses' AND v_is_def)
       ) THEN

      v_rem_qty := NULL;

      IF p_remaining IS NOT NULL AND jsonb_typeof(p_remaining) = 'array' THEN
        IF v_idx < jsonb_array_length(p_remaining) THEN
          v_rem := p_remaining->v_idx;
          IF (v_rem->>'code') IS NOT DISTINCT FROM (v_unit->>'code') THEN
            v_rem_qty := COALESCE((v_rem->>'quantity')::integer, 0);
          END IF;
        END IF;

        IF v_rem_qty IS NULL THEN
          SELECT COALESCE((r->>'quantity')::integer, 0) INTO v_rem_qty
          FROM jsonb_array_elements(p_remaining) AS r
          WHERE r->>'code' = v_unit->>'code'
          LIMIT 1;
        END IF;
      END IF;

      v_rem_qty := GREATEST(0, LEAST(v_init_qty, COALESCE(v_rem_qty, 0)));

      v_out := v_out || jsonb_build_object(
        'name', v_unit->>'name',
        'code', v_unit->>'code',
        'initial', v_init_qty,
        'remaining', v_rem_qty,
        'lost', v_init_qty - v_rem_qty
      );
    END IF;

    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_out;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.battle_units_diff(jsonb, jsonb, text) TO authenticated, service_role, anon;
