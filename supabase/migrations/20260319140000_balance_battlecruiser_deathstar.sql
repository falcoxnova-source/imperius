/*
  # Full combat rebalance — OGame classic values + reduced hull

  Reverts weapon_power and shield_power to OGame classic base values.
  Hull (structural_integrity) set to ~40% of original OGame values
  for faster, more decisive battles.

  Also includes:
  - Death Star: remove rapid fire vs self and vs Plasma Turret
*/

-- ============================================================
-- 1. Death Star: remove rapid fire vs deathstar & plasma_turret
-- ============================================================
UPDATE ship_types
SET rapid_fire = rapid_fire - 'deathstar' - 'plasma_turret'
WHERE code = 'deathstar';

-- ============================================================
-- 2. Combat stats rebalance — all combat ships
-- ============================================================

-- Caza Ligero: ataque 50, escudo 10, blindaje 1600
UPDATE ship_types
SET weapon_power = 50, shield_power = 10, structural_integrity = 1600
WHERE code = 'light_fighter';

-- Caza Pesado: ataque 150, escudo 25, blindaje 4000
UPDATE ship_types
SET weapon_power = 150, shield_power = 25, structural_integrity = 4000
WHERE code = 'heavy_fighter';

-- Crucero: ataque 400, escudo 50, blindaje 10800
UPDATE ship_types
SET weapon_power = 400, shield_power = 50, structural_integrity = 10800
WHERE code = 'cruiser';

-- Nave de Batalla: ataque 1000, escudo 200, blindaje 24000
UPDATE ship_types
SET weapon_power = 1000, shield_power = 200, structural_integrity = 24000
WHERE code = 'battleship';

-- Acorazado: ataque 700, escudo 400, blindaje 28000
UPDATE ship_types
SET weapon_power = 700, shield_power = 400, structural_integrity = 28000
WHERE code = 'battlecruiser';

-- Bombardero: ataque 1000, escudo 500, blindaje 30000
UPDATE ship_types
SET weapon_power = 1000, shield_power = 500, structural_integrity = 30000
WHERE code = 'bomber';

-- Destructor: ataque 2000, escudo 500, blindaje 44000
UPDATE ship_types
SET weapon_power = 2000, shield_power = 500, structural_integrity = 44000
WHERE code = 'destroyer';

-- ============================================================
-- 3. Combat stats rebalance — special ships
-- ============================================================

-- Destructor de Estrellas: ataque 6200, escudo 1600, blindaje 120000
UPDATE ship_types
SET weapon_power = 6200, shield_power = 1600, structural_integrity = 120000
WHERE code = 'star_destroyer';

-- Luna Negra: ataque 10000, escudo 5000, blindaje 320000
UPDATE ship_types
SET weapon_power = 10000, shield_power = 5000, structural_integrity = 320000
WHERE code = 'black_moon';

-- Estrella de la Muerte: ataque 200000, escudo 50000, blindaje 3600000, RF vs black_moon x2
UPDATE ship_types
SET weapon_power = 200000, shield_power = 50000, structural_integrity = 3600000,
    rapid_fire = rapid_fire || '{"black_moon": 2}'::jsonb
WHERE code = 'deathstar';

-- Nova: ataque 150000, escudo 70000, blindaje 4400000
UPDATE ship_types
SET weapon_power = 150000, shield_power = 70000, structural_integrity = 4400000
WHERE code = 'nova';

-- Destruccion Masiva: ataque 35000000, escudo 20000000, blindaje 252000000
UPDATE ship_types
SET weapon_power = 35000000, shield_power = 20000000, structural_integrity = 252000000
WHERE code = 'destruccion_masiva';

-- ============================================================
-- 4. Combat stats rebalance — defenses
-- ============================================================

-- Lanzamisiles: ataque 80, escudo 20, blindaje 800
UPDATE defense_types
SET weapon_power = 80, shield_power = 20, structural_integrity = 800
WHERE code = 'rocket_launcher';

-- Láser Ligero: ataque 100, escudo 25, blindaje 800
UPDATE defense_types
SET weapon_power = 100, shield_power = 25, structural_integrity = 800
WHERE code = 'light_laser';

-- Láser Pesado: ataque 250, escudo 100, blindaje 3200
UPDATE defense_types
SET weapon_power = 250, shield_power = 100, structural_integrity = 3200
WHERE code = 'heavy_laser';

-- Cañón Iónico: ataque 150, escudo 500, blindaje 3200
UPDATE defense_types
SET weapon_power = 150, shield_power = 500, structural_integrity = 3200
WHERE code = 'ion_cannon';

-- Cañón de Gauss: ataque 1100, escudo 200, blindaje 14000
UPDATE defense_types
SET weapon_power = 1100, shield_power = 200, structural_integrity = 14000
WHERE code = 'gauss_cannon';

-- Torreta de Plasma: ataque 3000, escudo 300, blindaje 40000
UPDATE defense_types
SET weapon_power = 3000, shield_power = 300, structural_integrity = 40000
WHERE code = 'plasma_turret';

-- Cúpula Pequeña de Escudo: ataque 0, escudo 2000, blindaje 8000
UPDATE defense_types
SET weapon_power = 0, shield_power = 2000, structural_integrity = 8000
WHERE code = 'small_shield_dome';

-- Cúpula Grande de Escudo: ataque 0, escudo 10000, blindaje 40000
UPDATE defense_types
SET weapon_power = 0, shield_power = 10000, structural_integrity = 40000
WHERE code = 'large_shield_dome';

-- ============================================================
-- 5. Nova: actualizar requisitos de construcción
--    Espionaje 12, Hangar 15, Armas 14, Escudo 14,
--    Blindaje 15, Hiperespacio 10, Láser 20, Gravitón 3
-- ============================================================
DO $$
DECLARE
  v_nova_id int;
  v_shipyard_id int;
  v_espionage_tech_id int;
  v_weapons_tech_id int;
  v_shielding_tech_id int;
  v_armour_tech_id int;
  v_hyperspace_tech_id int;
  v_laser_tech_id int;
  v_graviton_tech_id int;
BEGIN
  SELECT id INTO v_nova_id FROM ship_types WHERE code = 'nova';
  SELECT id INTO v_shipyard_id FROM building_types WHERE code = 'shipyard';
  SELECT id INTO v_espionage_tech_id FROM technology_types WHERE code = 'espionage_tech';
  SELECT id INTO v_weapons_tech_id FROM technology_types WHERE code = 'weapons_tech';
  SELECT id INTO v_shielding_tech_id FROM technology_types WHERE code = 'shielding_tech';
  SELECT id INTO v_armour_tech_id FROM technology_types WHERE code = 'armour_tech';
  SELECT id INTO v_hyperspace_tech_id FROM technology_types WHERE code = 'hyperspace_tech';
  SELECT id INTO v_laser_tech_id FROM technology_types WHERE code = 'laser_tech';
  SELECT id INTO v_graviton_tech_id FROM technology_types WHERE code = 'graviton_tech';

  -- Borrar requisitos anteriores de la Nova
  DELETE FROM ship_requirements WHERE ship_type_id = v_nova_id;

  -- Insertar nuevo requisito de edificio: Hangar nivel 15
  INSERT INTO ship_requirements (ship_type_id, required_building_id, required_building_level)
  VALUES (v_nova_id, v_shipyard_id, 15);

  -- Insertar nuevos requisitos de tecnología
  INSERT INTO ship_requirements (ship_type_id, required_tech_id, required_tech_level)
  VALUES
    (v_nova_id, v_espionage_tech_id, 12),
    (v_nova_id, v_weapons_tech_id, 14),
    (v_nova_id, v_shielding_tech_id, 14),
    (v_nova_id, v_armour_tech_id, 15),
    (v_nova_id, v_hyperspace_tech_id, 10),
    (v_nova_id, v_laser_tech_id, 20),
    (v_nova_id, v_graviton_tech_id, 3);
END $$;
