/*
  # Ajustar probabilidades de daño a edificios en ataque

  - Fábrica de Robots: 30% → 10%
  - Hangar (Shipyard): 30% → 10%
  - Laboratorio: 30% → 10%
  - Fábrica de Nanobots: 30% → 5%
*/

-- Rewrite process_fleet_arrival with adjusted building damage probabilities
-- Only the IF random() < 0.30 line changes to use per-building probability

DO $$
DECLARE
  v_func_body text;
BEGIN
  SELECT prosrc INTO v_func_body
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival';

  IF v_func_body IS NOT NULL AND v_func_body LIKE '%IF random() < 0.30 THEN%' THEN
    v_func_body := replace(
      v_func_body,
      'IF random() < 0.30 THEN
              UPDATE planet_buildings
              SET level = level - 1
              WHERE id = v_bld_record.id;',
      'IF random() < (CASE v_bld_record.code WHEN ''nanite_factory'' THEN 0.05 ELSE 0.10 END) THEN
              UPDATE planet_buildings
              SET level = level - 1
              WHERE id = v_bld_record.id;'
    );

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
      v_func_body
    );
  END IF;
END $$;
