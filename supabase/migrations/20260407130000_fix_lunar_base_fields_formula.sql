-- Migration: Fix Lunar Base fields_max formula in optimized_global_queue_processor
-- Problem: The cron function uses FLOOR(diameter / 1000.0) + (level * 3) instead of 1 + (level * 3)
-- This gives moons extra fields based on diameter, breaking OGame balance.
-- 47 out of 50 moons currently have incorrect fields_max values.
--
-- Fix:
-- 1. Patch the live function to use correct formula: 1 + (level * 3)
-- 2. Backfill all moon fields_max using GREATEST(fields_used, 1 + LB_level * 3)
--    so no player loses buildings they already placed.

-- =========================================================================
-- STEP 1: Patch optimized_global_queue_processor dynamically
-- =========================================================================
DO $$
DECLARE
  v_function_body text;
  v_new_body text;
BEGIN
  -- Read the current function source
  SELECT prosrc INTO v_function_body
  FROM pg_proc
  WHERE proname = 'optimized_global_queue_processor';

  IF v_function_body IS NULL THEN
    RAISE EXCEPTION 'Function optimized_global_queue_processor not found';
  END IF;

  -- Replace the broken diameter-based formula with the correct one
  v_new_body := REPLACE(
    v_function_body,
    'SET fields_max = FLOOR(diameter / 1000.0) + (v_queue_item.target_level * 3)',
    'SET fields_max = 1 + (v_queue_item.target_level * 3)'
  );

  -- Verify the replacement actually happened
  IF v_new_body = v_function_body THEN
    RAISE WARNING 'Lunar base formula not found in function - may already be fixed or format changed';
  ELSE
    -- Recreate the function with the patched body
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION optimized_global_queue_processor() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$%s$fn$',
      v_new_body
    );
    RAISE NOTICE 'Successfully patched optimized_global_queue_processor: lunar base formula fixed';
  END IF;
END;
$$;

-- =========================================================================
-- STEP 2: Safe backfill - fix all moon fields_max
-- Uses GREATEST(fields_used, correct_formula) so no one loses existing buildings
-- =========================================================================
UPDATE planets p
SET fields_max = GREATEST(
  p.fields_used,
  1 + COALESCE(pb.level, 0) * 3
)
FROM (
  SELECT p2.id as planet_id, COALESCE(pb2.level, 0) as level
  FROM planets p2
  LEFT JOIN planet_buildings pb2 
    ON pb2.planet_id = p2.id 
    AND pb2.building_type_id = (SELECT id FROM building_types WHERE code = 'lunar_base')
  WHERE p2.planet_type = 'moon'
) pb
WHERE p.id = pb.planet_id
AND p.planet_type = 'moon';
