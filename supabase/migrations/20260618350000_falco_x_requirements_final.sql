/*
  # Falco-X Clasica: requisitos finales
  - Hangar 14
  - Hiperespacio Tech 9
  - Hiperespacio Drive 11
  - Impulso 10
  - Laser 12
  - Ionica 8
  - Plasma 8
  - Blindaje 12
  - Armas 12
  - Graviton 2
*/

DO $$
DECLARE
  v_ship_id integer;
  v_shipyard_id integer;
BEGIN
  SELECT id INTO v_ship_id FROM ship_types WHERE code = 'falco_x_clasica';
  SELECT id INTO v_shipyard_id FROM building_types WHERE code = 'shipyard';

  IF v_ship_id IS NULL THEN
    RAISE EXCEPTION 'falco_x_clasica no encontrada';
  END IF;

  DELETE FROM ship_requirements WHERE ship_type_id = v_ship_id;

  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
  VALUES (v_ship_id, v_shipyard_id, 14);

  INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
  SELECT v_ship_id, tt.id, lvl
  FROM (VALUES
    ('hyperspace_tech',  9),
    ('hyperspace_drive', 11),
    ('impulse_drive',    10),
    ('laser_tech',       12),
    ('ion_tech',         8),
    ('plasma_tech',      8),
    ('armour_tech',      12),
    ('weapons_tech',     12),
    ('graviton_tech',    2)
  ) AS r(code, lvl)
  JOIN technology_types tt ON tt.code = r.code;
END $$;
