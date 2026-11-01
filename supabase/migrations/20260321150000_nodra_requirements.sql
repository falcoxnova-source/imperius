/*
  # Actualizar requisitos de Nodra (antes Destruccion Masiva)

  Nuevos requisitos:
  - Hangar (Nivel 18)
  - Armas (Nivel 20)
  - Escudo (Nivel 20)
  - Blindaje (Nivel 20)
  - Hiperespacio (Nivel 15)
  - Propulsores hiperespaciales (Nivel 20)
  - Láser (Nivel 25)
  - Gravitón (Nivel 8)
*/

DO $$
DECLARE
  v_nodra_id int;
  v_shipyard_id int;
  v_weapons_tech_id int;
  v_shielding_tech_id int;
  v_armour_tech_id int;
  v_hyperspace_tech_id int;
  v_hyperspace_drive_id int;
  v_laser_tech_id int;
  v_graviton_tech_id int;
BEGIN
  -- Obtener IDs
  SELECT id INTO v_nodra_id FROM ship_types WHERE code = 'destruccion_masiva';
  SELECT id INTO v_shipyard_id FROM building_types WHERE code = 'shipyard';
  SELECT id INTO v_weapons_tech_id FROM technology_types WHERE code = 'weapons_tech';
  SELECT id INTO v_shielding_tech_id FROM technology_types WHERE code = 'shielding_tech';
  SELECT id INTO v_armour_tech_id FROM technology_types WHERE code = 'armour_tech';
  SELECT id INTO v_hyperspace_tech_id FROM technology_types WHERE code = 'hyperspace_tech';
  SELECT id INTO v_hyperspace_drive_id FROM technology_types WHERE code = 'hyperspace_drive';
  SELECT id INTO v_laser_tech_id FROM technology_types WHERE code = 'laser_tech';
  SELECT id INTO v_graviton_tech_id FROM technology_types WHERE code = 'graviton_tech';

  -- Borrar requisitos anteriores de Nodra
  DELETE FROM ship_requirements WHERE ship_type_id = v_nodra_id;

  -- Insertar requisito de edificio: Hangar nivel 18
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
  VALUES (v_nodra_id, v_shipyard_id, 18)
  ON CONFLICT DO NOTHING;

  -- Insertar requisitos de tecnología
  INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
  VALUES
    (v_nodra_id, v_weapons_tech_id, 20),
    (v_nodra_id, v_shielding_tech_id, 20),
    (v_nodra_id, v_armour_tech_id, 20),
    (v_nodra_id, v_hyperspace_tech_id, 15),
    (v_nodra_id, v_hyperspace_drive_id, 20),
    (v_nodra_id, v_laser_tech_id, 25),
    (v_nodra_id, v_graviton_tech_id, 8)
  ON CONFLICT DO NOTHING;
  
  -- Actualizar la secuencia para evitar conflictos futuros
  PERFORM setval(
    pg_get_serial_sequence('ship_requirements', 'id'),
    COALESCE((SELECT MAX(id) FROM ship_requirements), 1)
  );
END $$;
