/*
  # Update Fragata Grande requirements and refund existing ships

  1. Changes
    - Remove old requirements for Fragata Grande (ship_type_id = 19):
      - Hangar level 6 (req id 60)
      - Motor de Combustion level 8 (req id 61)
      - Tecnologia de Blindaje level 4 (req id 62)
    - Add new requirements:
      - Hangar level 14 (building_id = 11)
      - Tecnologia de Hiperespacio level 10 (tech_id = 4)
      - Motor de Impulso level 15 (tech_id = 7)

  2. Refund
    - All players who currently own Fragata Grande get resources refunded
      to their MAIN planet (metal: 80000, crystal: 80000, deuterium: 30000 per ship)
    - Ships are removed from all planets

  3. Safety
    - No other ship types or data affected
    - Resources are added, not subtracted
*/

-- Step 1: Delete old requirements for Fragata Grande
DELETE FROM ship_requirements WHERE ship_type_id = 19;

-- Step 2: Insert new requirements
INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
VALUES
  (19, 11, 14, NULL, 0),
  (19, NULL, 0, 4, 10),
  (19, NULL, 0, 7, 15);

-- Step 3: Refund resources to each user's main planet and remove ships
DO $$
DECLARE
  v_user RECORD;
  v_main_planet_id uuid;
  v_total_ships integer;
  v_metal_per_ship integer := 80000;
  v_crystal_per_ship integer := 80000;
  v_deuterium_per_ship integer := 30000;
BEGIN
  FOR v_user IN
    SELECT ps.planet_id, ps.quantity, p.user_id
    FROM planet_ships ps
    JOIN planets p ON p.id = ps.planet_id
    WHERE ps.ship_type_id = 19 AND ps.quantity > 0
  LOOP
    SELECT id INTO v_main_planet_id
    FROM planets
    WHERE user_id = v_user.user_id AND is_main_planet = true
    LIMIT 1;

    IF v_main_planet_id IS NOT NULL THEN
      UPDATE planet_resources
      SET
        metal = metal + (v_user.quantity * v_metal_per_ship),
        crystal = crystal + (v_user.quantity * v_crystal_per_ship),
        deuterium = deuterium + (v_user.quantity * v_deuterium_per_ship)
      WHERE planet_id = v_main_planet_id;
    END IF;
  END LOOP;

  DELETE FROM planet_ships WHERE ship_type_id = 19;
END $$;
