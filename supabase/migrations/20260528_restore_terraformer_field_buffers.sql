-- Restore fields_max buffer for planets affected by the
-- validate_fields_on_update trigger after Step 2 of the migration.
--
-- These are planets with terraformer where:
-- - fields_used == fields_max (no buffer left)
-- - calculate_planet_max_fields(id) < fields_used (expected was less, trigger kicked in)
--
-- We add enough to restore a reasonable buffer (25 fields above used).

UPDATE planets p
SET fields_max = fields_used + 25
WHERE p.planet_type = 'planet'
  AND p.user_id IS NOT NULL
  AND p.fields_used = p.fields_max
  AND public.calculate_planet_max_fields(p.id) < p.fields_used
  AND p.fields_used < public.calculate_planet_max_fields(p.id) + 50
  AND EXISTS (
    SELECT 1 FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = p.id AND bt.code = 'terraformer' AND pb.level > 0
  );

DO $$
DECLARE
  v_fixed integer;
BEGIN
  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RAISE NOTICE 'Buffers restaurados para % planetas (+25 fields)', v_fixed;
END;
$$;
