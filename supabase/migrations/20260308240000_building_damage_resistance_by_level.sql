-- =============================================================================
-- Ajuste: Daño a edificios en combate
-- =============================================================================
-- 1. Máximo 1 edificio dañado por batalla (ORDER BY random() LIMIT 1)
-- 2. Probabilidad de daño según nivel del edificio
--
-- Fábrica Robots / Hangar / Laboratorio (base 10%):
--   Nivel 1-5:   10%
--   Nivel 6-10:  8%
--   Nivel 11-15: 6%
--   Nivel 16-20: 4%
--   Nivel 21-25: 2%
--   Nivel 26+:   1%
--
-- Fábrica de Nanobots (base 5%):
--   Nivel 1-5:   5%
--   Nivel 6-10:  4%
--   Nivel 11-15: 3%
--   Nivel 16-20: 2%
--   Nivel 21+:   1%
-- =============================================================================

DO $$
DECLARE
  v_func_body text;
  v_replaced boolean := false;
BEGIN
  SELECT prosrc INTO v_func_body
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival';

  IF v_func_body IS NULL THEN
    RAISE NOTICE 'process_fleet_arrival not found, skipping';
    RETURN;
  END IF;

  -- Paso 1: Limitar a 1 edificio al azar (ORDER BY random() LIMIT 1)
  IF v_func_body LIKE '%AND COALESCE(pb.is_upgrading, false) = false
LOOP%' THEN
    v_func_body := replace(
      v_func_body,
      'AND COALESCE(pb.is_upgrading, false) = false
LOOP',
      'AND COALESCE(pb.is_upgrading, false) = false
ORDER BY random() LIMIT 1
LOOP'
    );
  END IF;

  -- Paso 2: Probabilidad según nivel
  -- Escenario 1: migración 20260308130000 ya aplicada (CASE con 0.05/0.10)
  IF v_func_body LIKE '%CASE v_bld_record.code WHEN ''nanite_factory'' THEN 0.05 ELSE 0.10 END%' THEN
    v_func_body := replace(
      v_func_body,
      'IF random() < (CASE v_bld_record.code WHEN ''nanite_factory'' THEN 0.05 ELSE 0.10 END) THEN',
      'IF random() < (
              CASE
                WHEN v_bld_record.code = ''nanite_factory'' THEN
                  CASE
                    WHEN v_bld_record.level <= 5  THEN 0.05
                    WHEN v_bld_record.level <= 10 THEN 0.04
                    WHEN v_bld_record.level <= 15 THEN 0.03
                    WHEN v_bld_record.level <= 20 THEN 0.02
                    ELSE 0.01
                  END
                ELSE
                  CASE
                    WHEN v_bld_record.level <= 5  THEN 0.10
                    WHEN v_bld_record.level <= 10 THEN 0.08
                    WHEN v_bld_record.level <= 15 THEN 0.06
                    WHEN v_bld_record.level <= 20 THEN 0.04
                    WHEN v_bld_record.level <= 25 THEN 0.02
                    ELSE 0.01
                  END
              END
            ) THEN'
    );
    v_replaced := true;

  -- Escenario 2: migración 20260308130000 NO aplicada (todavía usa 0.30)
  ELSIF v_func_body LIKE '%IF random() < 0.30 THEN%' THEN
    v_func_body := replace(
      v_func_body,
      'IF random() < 0.30 THEN',
      'IF random() < (
              CASE
                WHEN v_bld_record.code = ''nanite_factory'' THEN
                  CASE
                    WHEN v_bld_record.level <= 5  THEN 0.05
                    WHEN v_bld_record.level <= 10 THEN 0.04
                    WHEN v_bld_record.level <= 15 THEN 0.03
                    WHEN v_bld_record.level <= 20 THEN 0.02
                    ELSE 0.01
                  END
                ELSE
                  CASE
                    WHEN v_bld_record.level <= 5  THEN 0.10
                    WHEN v_bld_record.level <= 10 THEN 0.08
                    WHEN v_bld_record.level <= 15 THEN 0.06
                    WHEN v_bld_record.level <= 20 THEN 0.04
                    WHEN v_bld_record.level <= 25 THEN 0.02
                    ELSE 0.01
                  END
              END
            ) THEN'
    );
    v_replaced := true;
  END IF;

  IF v_replaced THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
      v_func_body
    );
    RAISE NOTICE 'Building damage: max 1 building + level resistance applied';
  ELSE
    RAISE NOTICE 'No matching pattern found - building damage may already be updated';
  END IF;
END $$;
