/*
  # Ajuste de requisitos: Mega Reciclador y Falco-X Clasica

  - Sube requisitos para que sean menos triviales.
  - Elimina dependencia de graviton en Falco-X (no lleva graviton).
  - Idempotente: borra requisitos previos de cada nave y reinserta el set correcto.

  Mapeo IDs:
    Buildings:
      11 = shipyard (Hangar)
    Technologies:
      2  = laser_tech
      3  = ion_tech
      4  = hyperspace_tech
      5  = plasma_tech
      7  = impulse_drive (Motor de Impulso)
      8  = hyperspace_drive (Motor de Hiperespacio / Propulsor Hiperespacial)
      9  = weapons_tech
      11 = armour_tech
*/

DO $$
DECLARE
  v_mega_id integer;
  v_falco_id integer;
BEGIN
  SELECT id INTO v_mega_id FROM ship_types WHERE code = 'mega_recycler';
  SELECT id INTO v_falco_id FROM ship_types WHERE code = 'falco_x_clasica';

  -- ============================================================
  -- MEGA RECICLADOR
  -- ============================================================
  IF v_mega_id IS NOT NULL THEN
    DELETE FROM ship_requirements WHERE ship_type_id = v_mega_id;

    -- Hangar Nivel 16
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_mega_id, 11, 16, NULL, NULL);

    -- Motor de Impulso Nivel 12
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_mega_id, NULL, NULL, 7, 12);

    -- Motor de Hiperespacio Nivel 10
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_mega_id, NULL, NULL, 8, 10);

    -- Tecnologia de Hiperespacio Nivel 8
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_mega_id, NULL, NULL, 4, 8);
  END IF;

  -- ============================================================
  -- FALCO-X CLASICA  (sin graviton)
  -- ============================================================
  IF v_falco_id IS NOT NULL THEN
    DELETE FROM ship_requirements WHERE ship_type_id = v_falco_id;

    -- Hangar Nivel 18
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_falco_id, 11, 18, NULL, NULL);

    -- Motor de Hiperespacio Nivel 16
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_falco_id, NULL, NULL, 8, 16);

    -- Tecnologia de Hiperespacio Nivel 12
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_falco_id, NULL, NULL, 4, 12);

    -- Motor de Impulso Nivel 12
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_falco_id, NULL, NULL, 7, 12);

    -- Tecnologia Laser Nivel 18
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_falco_id, NULL, NULL, 2, 18);

    -- Tecnologia Ionica Nivel 10
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_falco_id, NULL, NULL, 3, 10);

    -- Tecnologia de Plasma Nivel 10
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_falco_id, NULL, NULL, 5, 10);

    -- Tecnologia de Blindaje Nivel 16
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_falco_id, NULL, NULL, 11, 16);

    -- Tecnologia de Armas Nivel 16
    INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES (v_falco_id, NULL, NULL, 9, 16);
  END IF;
END $$;
