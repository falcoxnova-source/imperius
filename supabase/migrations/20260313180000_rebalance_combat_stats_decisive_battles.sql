/*
  # Rebalanceo de estadísticas de combate para batallas más decisivas
  
  Problema: Las batallas terminan frecuentemente en empate porque el casco/blindaje
  es demasiado alto en relación al ataque, haciendo que las unidades no se destruyan
  lo suficientemente rápido.

  Solución:
  - Ataque (weapon_power): +50% para todas las naves estándar y defensas
  - Casco (structural_integrity): -30% para todas las naves estándar y defensas
  - Escudo (shield_power): -15% para todas las naves estándar y defensas
  - Carga (cargo_capacity): sin cambios
  - Fuego rápido (rapid_fire): sin cambios

  Naves NO afectadas (capitales/especiales):
  - deathstar, nova, destruccion_masiva, falco_x_clasica

  Ajustes adicionales de rol:
  - Acorazado: escudo mejorado (rol tanque equilibrado)
  - Destructor de Estrellas: buff ataque/escudo (rol anti-naves)
  - Luna Negra: buff ataque/escudo (rol anti-defensas)

  Esto hará que las batallas sean más rápidas y decisivas, con un ganador claro.
*/

-- =============================================
-- NAVES ESTÁNDAR - Rebalanceo de combate
-- =============================================

-- Cazador Ligero: weapon 50→75, shield 10→8, hull 4000→2800
UPDATE ship_types
SET weapon_power = 75,
    shield_power = 8,
    structural_integrity = 2800
WHERE code = 'light_fighter';

-- Cazador Pesado: weapon 150→225, shield 25→21, hull 10000→7000
UPDATE ship_types
SET weapon_power = 225,
    shield_power = 21,
    structural_integrity = 7000
WHERE code = 'heavy_fighter';

-- Crucero: weapon 400→600, shield 50→42, hull 27000→18900
UPDATE ship_types
SET weapon_power = 600,
    shield_power = 42,
    structural_integrity = 18900
WHERE code = 'cruiser';

-- Nave de Batalla: weapon 1000→1500, shield 200→170, hull 60000→42000
UPDATE ship_types
SET weapon_power = 1500,
    shield_power = 170,
    structural_integrity = 42000
WHERE code = 'battleship';

-- Acorazado: weapon 700→1150, shield 400→550 (mejorado, rol tanque), hull 70000→52000
UPDATE ship_types
SET weapon_power = 1150,
    shield_power = 550,
    structural_integrity = 52000
WHERE code = 'battlecruiser';

-- Bombardero: weapon 1000→1500, shield 500→425, hull 75000→52500
UPDATE ship_types
SET weapon_power = 1500,
    shield_power = 425,
    structural_integrity = 52500
WHERE code = 'bomber';

-- Destructor: weapon 2000→3000, shield 500→425, hull 110000→77000
UPDATE ship_types
SET weapon_power = 3000,
    shield_power = 425,
    structural_integrity = 77000
WHERE code = 'destroyer';

-- =============================================
-- NAVES CIVILES - Rebalanceo de combate
-- =============================================

-- Transporte Pequeño: weapon 5→7, shield 10→8, hull 4000→2800
UPDATE ship_types
SET weapon_power = 7,
    shield_power = 8,
    structural_integrity = 2800
WHERE code = 'small_cargo';

-- Transporte Grande: weapon 5→7, shield 25→21, hull 12000→8400
UPDATE ship_types
SET weapon_power = 7,
    shield_power = 21,
    structural_integrity = 8400
WHERE code = 'large_cargo';

-- Colonizadora: weapon 50→75, shield 100→85, hull 30000→21000
UPDATE ship_types
SET weapon_power = 75,
    shield_power = 85,
    structural_integrity = 21000
WHERE code = 'colony_ship';

-- Reciclador: weapon 1→1 (mínimo), shield 10→8, hull 16000→11200
UPDATE ship_types
SET weapon_power = 1,
    shield_power = 8,
    structural_integrity = 11200
WHERE code = 'recycler';

-- Fragata Grande: weapon 50→75, shield 120→102, hull 95000→66500
UPDATE ship_types
SET weapon_power = 75,
    shield_power = 102,
    structural_integrity = 66500
WHERE code = 'large_frigate';

-- Sonda Espionaje: sin cambios (weapon=0, hull=1000)
-- Solar Satellite: sin cambios (weapon=1, hull=2000)

-- =============================================
-- DEFENSAS - Rebalanceo de combate
-- =============================================

-- Lanzamisiles: weapon 80→120, shield 20→17, hull 2000→1400
UPDATE defense_types
SET weapon_power = 120,
    shield_power = 17,
    structural_integrity = 1400
WHERE code = 'rocket_launcher';

-- Láser Ligero: weapon 100→150, shield 25→21, hull 2000→1400
UPDATE defense_types
SET weapon_power = 150,
    shield_power = 21,
    structural_integrity = 1400
WHERE code = 'light_laser';

-- Láser Pesado: weapon 250→375, shield 100→85, hull 8000→5600
UPDATE defense_types
SET weapon_power = 375,
    shield_power = 85,
    structural_integrity = 5600
WHERE code = 'heavy_laser';

-- Cañón de Gauss: weapon 1100→1650, shield 200→170, hull 35000→24500
UPDATE defense_types
SET weapon_power = 1650,
    shield_power = 170,
    structural_integrity = 24500
WHERE code = 'gauss_cannon';

-- Cañón Iónico: weapon 150→225, shield 500→425, hull 8000→5600
UPDATE defense_types
SET weapon_power = 225,
    shield_power = 425,
    structural_integrity = 5600
WHERE code = 'ion_cannon';

-- Torreta de Plasma: weapon 3000→4500, shield 300→255, hull 100000→70000
UPDATE defense_types
SET weapon_power = 4500,
    shield_power = 255,
    structural_integrity = 70000
WHERE code = 'plasma_turret';

-- Cúpula Pequeña de Escudo: weapon=0 (sin cambio), shield 2000→1700, hull 20000→14000
UPDATE defense_types
SET shield_power = 1700,
    structural_integrity = 14000
WHERE code = 'small_shield_dome';

-- Cúpula Grande de Escudo: weapon=0 (sin cambio), shield 10000→8500, hull 100000→70000
UPDATE defense_types
SET shield_power = 8500,
    structural_integrity = 70000
WHERE code = 'large_shield_dome';

-- Misil de Intercepción y Misil Interplanetario: sin cambios (uso especial)

-- =============================================
-- NAVES ESPECIALES - Ajuste de roles
-- =============================================

-- Destructor de Estrellas: weapon 5600→6200, shield 1400→1600 (rol anti-naves)
UPDATE ship_types
SET weapon_power = 6200,
    shield_power = 1600
WHERE code = 'star_destroyer';

-- Luna Negra: weapon 4800→5500, shield 1200→1400 (rol anti-defensas)
UPDATE ship_types
SET weapon_power = 5500,
    shield_power = 1400
WHERE code = 'black_moon';
