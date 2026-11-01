/*
  # Falco-X Clasica: rebalance superior a Death Star, inferior a Nova

  Stats nuevas (intermedias entre Death Star y Nova):
    structural_integrity: 4,000,000  (Death Star 3.6M < 4M < Nova 4.4M)
    weapon_power:          175,000   (Death Star 200k, Nova 150k - se queda alta)
    shield_power:          60,000    (Death Star 50k < 60k < Nova 70k)
    cargo_capacity:        500,000
    base_speed:            6,000
    fuel_consumption:      2,200
    build_time_seconds:    216,000   (60 horas)

  Costo: 4M / 3M / 1M = 8M total (debajo de Death Star ~10M y Nova ~13M)

  Rapid fire de Falco-X CONTRA otras:
    deathstar: 2          → 1 Falco destruye 2 Death Stars por ronda
    nova: 1               → no destruye Novas con ventaja
    destruccion_masiva: 1
    star_destroyer: 3
    black_moon: 2
    + se mantienen los rapid fires base (cazadores, cruceros, etc.)

  Rapid fire de OTRAS contra Falco-X (para equilibrio):
    nova vs falco_x_clasica:               5  (1 Nova la mata fácil)
    destruccion_masiva vs falco_x_clasica: 5
    falco_x_clasica vs falco_x_clasica:    2  (5 Falcos matan 1 Falco rápido)
    deathstar NO recibe rapid fire vs falco (consistencia con "1 Falco mata 2 Death Stars")

  Requisitos: punto medio entre Death Star (12/6/7) y Nova (15/12/15/12/14/14/14):
    Hangar:                  14
    Tecnologia Hiperespacio: 9
    Motor Hiperespacio:      11
    Motor Impulso:           10
    Tecnologia Laser:        10
    Tecnologia Ionica:       8
    Tecnologia Plasma:       8
    Tecnologia Blindaje:     10
    Tecnologia Armas:        10
    (sin graviton)
*/

-- ============================================================
-- 1) STATS Y COSTO DE FALCO-X
-- ============================================================
UPDATE ship_types
SET
  structural_integrity = 4000000,
  weapon_power         = 175000,
  shield_power         = 60000,
  cargo_capacity       = 500000,
  base_speed           = 6000,
  fuel_consumption     = 2200,
  metal_cost           = 4000000,
  crystal_cost         = 3000000,
  deuterium_cost       = 1000000,
  build_time_seconds   = 216000,
  rapid_fire = jsonb_build_object(
    'deathstar', 2,
    'nova', 1,
    'destruccion_masiva', 1,
    'star_destroyer', 3,
    'black_moon', 2,
    'destroyer', 6,
    'battleship', 12,
    'battlecruiser', 10,
    'cruiser', 25,
    'bomber', 10,
    'heavy_fighter', 50,
    'light_fighter', 80,
    'recycler', 100,
    'small_cargo', 120,
    'large_cargo', 70,
    'espionage_probe', 300,
    'solar_satellite', 300,
    'rocket_launcher', 150,
    'light_laser', 80,
    'heavy_laser', 40,
    'gauss_cannon', 10,
    'ion_cannon', 18,
    'plasma_turret', 4
  )
WHERE code = 'falco_x_clasica';

-- ============================================================
-- 2) RAPID FIRE DE NOVA, DESTRUCCION_MASIVA, FALCO-X CONTRA FALCO-X
-- ============================================================
UPDATE ship_types
SET rapid_fire = COALESCE(rapid_fire, '{}'::jsonb) || jsonb_build_object('falco_x_clasica', 5)
WHERE code = 'nova';

UPDATE ship_types
SET rapid_fire = COALESCE(rapid_fire, '{}'::jsonb) || jsonb_build_object('falco_x_clasica', 5)
WHERE code = 'destruccion_masiva';

-- Falco-X vs Falco-X = 2 (5 Falcos matan 1 fácilmente)
UPDATE ship_types
SET rapid_fire = COALESCE(rapid_fire, '{}'::jsonb) || jsonb_build_object('falco_x_clasica', 2)
WHERE code = 'falco_x_clasica';

-- ============================================================
-- 3) REQUISITOS INTERMEDIOS (entre Death Star y Nova)
-- ============================================================
DO $$
DECLARE
  v_falco_id integer;
BEGIN
  SELECT id INTO v_falco_id FROM ship_types WHERE code = 'falco_x_clasica';
  IF v_falco_id IS NULL THEN RETURN; END IF;

  DELETE FROM ship_requirements WHERE ship_type_id = v_falco_id;

  -- Hangar 14
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
  VALUES (v_falco_id, 11, 14, NULL, NULL);

  -- Tecnologia Hiperespacio (4) Nivel 9
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
  VALUES (v_falco_id, NULL, NULL, 4, 9);

  -- Motor Hiperespacio (8) Nivel 11
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
  VALUES (v_falco_id, NULL, NULL, 8, 11);

  -- Motor Impulso (7) Nivel 10
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
  VALUES (v_falco_id, NULL, NULL, 7, 10);

  -- Laser (2) Nivel 10
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
  VALUES (v_falco_id, NULL, NULL, 2, 10);

  -- Ionica (3) Nivel 8
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
  VALUES (v_falco_id, NULL, NULL, 3, 8);

  -- Plasma (5) Nivel 8
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
  VALUES (v_falco_id, NULL, NULL, 5, 8);

  -- Blindaje (11) Nivel 10
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
  VALUES (v_falco_id, NULL, NULL, 11, 10);

  -- Armas (9) Nivel 10
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
  VALUES (v_falco_id, NULL, NULL, 9, 10);
END $$;

-- ============================================================
-- 4) ACTUALIZAR DESCRIPCION
-- ============================================================
UPDATE ship_types
SET description = 'Nave de combate elite. Mas poderosa que la Estrella de la Muerte y mas accesible que la Nova. Domina cualquier campo de batalla con su devastador armamento.'
WHERE code = 'falco_x_clasica';
