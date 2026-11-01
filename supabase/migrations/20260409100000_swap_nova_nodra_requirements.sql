-- Swap requirements between Nova and Nodra (destruccion_masiva)
-- Nova (cheaper ship) incorrectly had the HIGH requirements
-- Nodra (expensive ship) incorrectly had the LOW requirements

DO $$
DECLARE
  v_nova_id int;
  v_nodra_id int;
  v_shipyard_id int;
  v_weapons_tech_id int;
  v_shielding_tech_id int;
  v_armour_tech_id int;
  v_hyperspace_tech_id int;
  v_hyperspace_drive_id int;
  v_laser_tech_id int;
  v_graviton_tech_id int;
  v_plasma_tech_id int;
BEGIN
  -- Get ship IDs
  SELECT id INTO v_nova_id FROM ship_types WHERE code = 'nova';
  SELECT id INTO v_nodra_id FROM ship_types WHERE code = 'destruccion_masiva';

  -- Get building/tech IDs
  SELECT id INTO v_shipyard_id FROM building_types WHERE code = 'shipyard';
  SELECT id INTO v_weapons_tech_id FROM technology_types WHERE code = 'weapons_tech';
  SELECT id INTO v_shielding_tech_id FROM technology_types WHERE code = 'shielding_tech';
  SELECT id INTO v_armour_tech_id FROM technology_types WHERE code = 'armour_tech';
  SELECT id INTO v_hyperspace_tech_id FROM technology_types WHERE code = 'hyperspace_tech';
  SELECT id INTO v_hyperspace_drive_id FROM technology_types WHERE code = 'hyperspace_drive';
  SELECT id INTO v_laser_tech_id FROM technology_types WHERE code = 'laser_tech';
  SELECT id INTO v_graviton_tech_id FROM technology_types WHERE code = 'graviton_tech';
  SELECT id INTO v_plasma_tech_id FROM technology_types WHERE code = 'plasma_tech';

  -- Delete ALL current requirements for both ships
  DELETE FROM ship_requirements WHERE ship_type_id IN (v_nova_id, v_nodra_id);

  -- =============================================
  -- NOVA requirements (the LOWER ones, cheaper ship)
  -- Previously these were on Nodra
  -- =============================================
  -- Building: Hangar 15
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
  VALUES (v_nova_id, v_shipyard_id, 15);

  -- Techs
  INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
  VALUES
    (v_nova_id, v_hyperspace_drive_id, 15),
    (v_nova_id, v_hyperspace_tech_id, 12),
    (v_nova_id, v_graviton_tech_id, 3),
    (v_nova_id, v_plasma_tech_id, 12),
    (v_nova_id, v_weapons_tech_id, 14),
    (v_nova_id, v_armour_tech_id, 14),
    (v_nova_id, v_laser_tech_id, 14);

  -- =============================================
  -- NODRA (destruccion_masiva) requirements (the HIGHER ones, expensive ship)
  -- Previously these were on Nova
  -- =============================================
  -- Building: Hangar 18
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
  VALUES (v_nodra_id, v_shipyard_id, 18);

  -- Techs
  INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
  VALUES
    (v_nodra_id, v_weapons_tech_id, 20),
    (v_nodra_id, v_shielding_tech_id, 20),
    (v_nodra_id, v_armour_tech_id, 20),
    (v_nodra_id, v_hyperspace_tech_id, 15),
    (v_nodra_id, v_hyperspace_drive_id, 20),
    (v_nodra_id, v_laser_tech_id, 25),
    (v_nodra_id, v_graviton_tech_id, 8);

  RAISE NOTICE 'Requirements swapped successfully between Nova and Nodra';
END $$;
