-- ============================================================================
-- FALCO-X UNIVERSO - SETUP PARA NUEVO SERVIDOR
-- ============================================================================
-- Instrucciones:
--   1. Crear un nuevo proyecto en Supabase
--   2. Ejecutar TODAS las migraciones de la carpeta supabase/migrations/
--      (esto crea tablas, funciones, datos semilla, RLS, etc.)
--   3. Ejecutar ESTE archivo para crear la cuenta admin con planeta inicial
-- ============================================================================

-- ============================================================================
-- PASO 1: Crear la cuenta admin
-- ============================================================================
-- NOTA: El usuario debe existir primero en auth.users (se crea al registrarse)
-- Si usas el dashboard de Supabase para crear el usuario admin, su UUID
-- se insertará automáticamente en profiles. Si no, usa el SQL de abajo.

-- Insertar perfil admin (si no se creó automáticamente via trigger)
-- Reemplaza 'UUID_DEL_ADMIN' con el UUID real de auth.users
INSERT INTO profiles (
    id, username, email, is_admin, email_verified,
    fxu_balance, usdt_balance, dark_matter,
    points_total, points_buildings, points_research, points_fleet, points_defense, points_expedition,
    rank_position, rank_buildings, rank_research, rank_fleet, rank_defense, rank_expedition,
    battles_won, battles_draw, battles_lost,
    units_destroyed, units_lost,
    debris_metal_total, debris_crystal_total,
    is_banned, is_hidden, vacation_mode,
    notify_attacks, notify_buildings, notify_research, notify_messages
) VALUES (
    '00000000-0000-0000-0000-000000000001',  -- ← CAMBIAR por UUID real
    'admin', 'admin@falcox.net', true, true,
    0, 0, 0,
    0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0,
    0, 0, 0,
    0, 0,
    0, 0,
    false, false, false,
    true, true, true, true
);

-- ============================================================================
-- PASO 2: Crear planeta inicial para el admin
-- ============================================================================

-- Insertar planeta principal
INSERT INTO planets (
    id, user_id, name, galaxy, solar_system, position,
    planet_type, image_id, diameter, fields_used, fields_max,
    temp_min, temp_max, is_main_planet, is_destroyed
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',  -- ← CAMBIAR por UUID real
    'Planeta Principal', 1, 1, 4,
    'planet', 1, 12800, 0, 163,
    -40, 30, true, false
);

-- Insertar recursos iniciales
INSERT INTO planet_resources (
    planet_id, metal, crystal, deuterium,
    metal_per_hour, crystal_per_hour, deuterium_per_hour,
    metal_storage, crystal_storage, deuterium_storage,
    energy_used, energy_max
) 
SELECT id, 500, 500, 0, 30, 15, 0, 10000, 10000, 10000, 0, 0
FROM planets WHERE user_id = '00000000-0000-0000-0000-000000000001';  -- ← CAMBIAR

-- Insertar edificios (nivel 0 para todos los tipos)
INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
SELECT p.id, bt.id, 0, false
FROM planets p
CROSS JOIN building_types bt
WHERE p.user_id = '00000000-0000-0000-0000-000000000001';  -- ← CAMBIAR

-- Insertar tecnologías (nivel 0 para todos los tipos)
INSERT INTO user_technologies (user_id, technology_type_id, level, is_researching)
SELECT '00000000-0000-0000-0000-000000000001', tt.id, 0, false  -- ← CAMBIAR
FROM technology_types tt;

-- Insertar naves (cantidad 0 para todos los tipos)
INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction)
SELECT p.id, st.id, 0, 0
FROM planets p
CROSS JOIN ship_types st
WHERE p.user_id = '00000000-0000-0000-0000-000000000001';  -- ← CAMBIAR

-- Insertar defensas (cantidad 0 para todos los tipos)
INSERT INTO planet_defenses (planet_id, defense_type_id, quantity, in_construction)
SELECT p.id, dt.id, 0, 0
FROM planets p
CROSS JOIN defense_types dt
WHERE p.user_id = '00000000-0000-0000-0000-000000000001';  -- ← CAMBIAR

-- Marcar posición en galaxia como ocupada
UPDATE galaxy_positions
SET is_occupied = true, occupied_by = (
    SELECT id FROM planets WHERE user_id = '00000000-0000-0000-0000-000000000001' LIMIT 1  -- ← CAMBIAR
)
WHERE galaxy = 1 AND solar_system = 1 AND position = 4;
