/*
  # Agregar contenido faltante y corregir posicionamiento de planetas

  ## Descripcion
  Esta migracion agrega elementos faltantes del XNova original y corrige
  el sistema de posicionamiento de planetas para que sea secuencial.

  ## Cambios

  ### 1. Investigaciones Faltantes
  - Tecnologia de Red de Investigacion Intergalactica (permite sumar niveles de laboratorios)

  ### 2. Edificios de Lunas (para uso futuro)
  - Base Lunar (requerido para construir en lunas)
  - Sensor Phalanx (permite ver flotas enemigas)
  - Portal de Salto (teleportacion entre lunas)

  ### 3. Sistema de Posicionamiento de Planetas
  - Corregido para asignar posiciones secuenciales dentro de cada sistema solar
  - 15 posiciones por sistema solar
  - 5 jugadores maximo por sistema solar (posiciones 4-8 para planetas iniciales)
  - Sistema solar se llena secuencialmente
  - Cuando un sistema esta lleno, avanza al siguiente

  ## Seguridad
  - Las nuevas tablas heredan las politicas RLS existentes
  - La funcion de creacion de usuarios mantiene SECURITY DEFINER
*/

-- ============================================
-- 1. AGREGAR INVESTIGACION FALTANTE
-- ============================================
INSERT INTO technology_types (code, name, description, category, base_metal, base_crystal, base_deuterium, cost_factor, base_time_seconds, max_level)
VALUES (
  'intergalactic_research_network',
  'Red de Investigacion Intergalactica',
  'Permite conectar los laboratorios de investigacion de diferentes planetas para aumentar la velocidad de investigacion.',
  'advanced',
  240000,
  400000,
  160000,
  2.0,
  600,
  10
)
ON CONFLICT (code) DO NOTHING;

-- Agregar requisitos para la Red de Investigacion Intergalactica
DO $$
DECLARE
  irn_id int;
  hyperspace_tech_id int;
  computer_tech_id int;
BEGIN
  SELECT id INTO irn_id FROM technology_types WHERE code = 'intergalactic_research_network';
  SELECT id INTO hyperspace_tech_id FROM technology_types WHERE code = 'hyperspace_tech';
  SELECT id INTO computer_tech_id FROM technology_types WHERE code = 'computer_tech';
  
  IF irn_id IS NOT NULL THEN
    INSERT INTO technology_requirements (technology_type_id, required_tech_id, required_tech_level)
    VALUES 
      (irn_id, hyperspace_tech_id, 8),
      (irn_id, computer_tech_id, 8)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================
-- 2. AGREGAR EDIFICIOS DE LUNAS
-- ============================================
INSERT INTO building_types (code, name, description, category, base_metal, base_crystal, base_deuterium, cost_factor, base_time_seconds, max_level)
VALUES 
  ('lunar_base', 'Base Lunar', 'La base lunar es la instalacion principal necesaria para construir en una luna. Cada nivel proporciona campos adicionales.', 'facilities', 20000, 40000, 20000, 2.0, 300, 8),
  ('sensor_phalanx', 'Sensor Phalanx', 'El sensor Phalanx permite detectar movimientos de flotas enemigas en un rango determinado.', 'facilities', 20000, 40000, 20000, 2.0, 180, 7),
  ('jump_gate', 'Portal de Salto', 'El portal de salto permite teleportar flotas instantaneamente entre lunas que tengan este edificio.', 'facilities', 2000000, 4000000, 2000000, 2.0, 600, 1)
ON CONFLICT (code) DO NOTHING;

-- Agregar requisitos para edificios de lunas
DO $$
DECLARE
  lunar_base_id int;
  sensor_phalanx_id int;
  jump_gate_id int;
  hyperspace_tech_id int;
BEGIN
  SELECT id INTO lunar_base_id FROM building_types WHERE code = 'lunar_base';
  SELECT id INTO sensor_phalanx_id FROM building_types WHERE code = 'sensor_phalanx';
  SELECT id INTO jump_gate_id FROM building_types WHERE code = 'jump_gate';
  SELECT id INTO hyperspace_tech_id FROM technology_types WHERE code = 'hyperspace_tech';
  
  IF lunar_base_id IS NOT NULL AND sensor_phalanx_id IS NOT NULL THEN
    INSERT INTO building_requirements (building_type_id, required_building_id, required_building_level)
    VALUES 
      (sensor_phalanx_id, lunar_base_id, 1)
    ON CONFLICT DO NOTHING;
  END IF;
  
  IF lunar_base_id IS NOT NULL AND jump_gate_id IS NOT NULL AND hyperspace_tech_id IS NOT NULL THEN
    INSERT INTO building_requirements (building_type_id, required_building_id, required_building_level, required_tech_id, required_tech_level)
    VALUES 
      (jump_gate_id, lunar_base_id, 1, hyperspace_tech_id, 7)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================
-- 3. TABLA DE CONTROL DE POSICIONES
-- ============================================
CREATE TABLE IF NOT EXISTS galaxy_positions (
  id serial PRIMARY KEY,
  galaxy integer NOT NULL CHECK (galaxy >= 1 AND galaxy <= 9),
  solar_system integer NOT NULL CHECK (solar_system >= 1 AND solar_system <= 499),
  position integer NOT NULL CHECK (position >= 1 AND position <= 15),
  is_occupied boolean DEFAULT false,
  occupied_by uuid REFERENCES planets(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(galaxy, solar_system, position)
);

ALTER TABLE galaxy_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view galaxy positions"
  ON galaxy_positions FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- 4. FUNCION MEJORADA PARA CREAR USUARIOS
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_planet_id uuid;
  assigned_galaxy int;
  assigned_system int;
  assigned_position int;
  username_val text;
  planet_diameter int;
  planet_fields int;
  planet_temp_min int;
  planet_temp_max int;
  position_found boolean := false;
  current_galaxy int := 1;
  current_system int := 1;
  positions_in_system int[];
  available_position int;
BEGIN
  -- Obtener username
  username_val := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );

  -- Crear perfil
  INSERT INTO public.profiles (id, username, email)
  VALUES (NEW.id, username_val, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  -- Buscar una posicion disponible secuencialmente
  -- Las posiciones preferidas para planetas iniciales son 4-8 (zona habitable)
  positions_in_system := ARRAY[4, 5, 6, 7, 8, 9, 10, 11, 3, 12, 2, 13, 1, 14, 15];
  
  <<galaxy_loop>>
  FOR current_galaxy IN 1..5 LOOP
    <<system_loop>>
    FOR current_system IN 1..499 LOOP
      -- Verificar cuantos planetas hay en este sistema
      IF (SELECT COUNT(*) FROM planets 
          WHERE galaxy = current_galaxy 
          AND solar_system = current_system 
          AND planet_type = 'planet') < 5 THEN
        
        -- Buscar una posicion libre en este sistema
        FOREACH available_position IN ARRAY positions_in_system LOOP
          IF NOT EXISTS (
            SELECT 1 FROM planets 
            WHERE galaxy = current_galaxy 
            AND solar_system = current_system 
            AND position = available_position
            AND planet_type = 'planet'
          ) THEN
            assigned_galaxy := current_galaxy;
            assigned_system := current_system;
            assigned_position := available_position;
            position_found := true;
            EXIT galaxy_loop;
          END IF;
        END LOOP;
      END IF;
    END LOOP system_loop;
  END LOOP galaxy_loop;

  -- Si no se encontro posicion, usar valores por defecto
  IF NOT position_found THEN
    assigned_galaxy := 1;
    assigned_system := 1;
    assigned_position := floor(random() * 15 + 1)::int;
  END IF;

  -- Calcular caracteristicas del planeta basadas en la posicion
  -- Temperatura segun posicion (mas cercano al sol = mas caliente)
  CASE 
    WHEN assigned_position BETWEEN 1 AND 3 THEN
      planet_temp_min := 100 + floor(random() * 40)::int;
      planet_temp_max := planet_temp_min + 40;
    WHEN assigned_position BETWEEN 4 AND 6 THEN
      planet_temp_min := 40 + floor(random() * 30)::int;
      planet_temp_max := planet_temp_min + 40;
    WHEN assigned_position BETWEEN 7 AND 9 THEN
      planet_temp_min := 0 + floor(random() * 20)::int;
      planet_temp_max := planet_temp_min + 40;
    WHEN assigned_position BETWEEN 10 AND 12 THEN
      planet_temp_min := -40 + floor(random() * 20)::int;
      planet_temp_max := planet_temp_min + 40;
    ELSE
      planet_temp_min := -80 + floor(random() * 30)::int;
      planet_temp_max := planet_temp_min + 40;
  END CASE;

  -- Diametro y campos segun posicion
  CASE 
    WHEN assigned_position BETWEEN 1 AND 3 THEN
      planet_diameter := 8000 + floor(random() * 3000)::int;
    WHEN assigned_position BETWEEN 4 AND 6 THEN
      planet_diameter := 12000 + floor(random() * 3000)::int;
    WHEN assigned_position BETWEEN 7 AND 9 THEN
      planet_diameter := 14000 + floor(random() * 4000)::int;
    WHEN assigned_position BETWEEN 10 AND 12 THEN
      planet_diameter := 12000 + floor(random() * 3000)::int;
    ELSE
      planet_diameter := 8000 + floor(random() * 3000)::int;
  END CASE;

  -- Calcular campos maximos basado en diametro
  planet_fields := floor(power(planet_diameter / 1000, 2))::int;
  planet_fields := GREATEST(80, LEAST(250, planet_fields));

  -- Crear planeta
  INSERT INTO public.planets (
    id, user_id, name, galaxy, solar_system, position,
    is_main_planet, diameter, fields_max, temp_min, temp_max, image_id
  )
  VALUES (
    gen_random_uuid(), NEW.id, 'Planeta Principal',
    assigned_galaxy, assigned_system, assigned_position,
    true, planet_diameter, planet_fields, planet_temp_min, planet_temp_max,
    floor(random() * 10 + 1)::int
  )
  RETURNING id INTO new_planet_id;

  -- Crear recursos iniciales
  IF new_planet_id IS NOT NULL THEN
    INSERT INTO public.planet_resources (
      planet_id, metal, crystal, deuterium,
      metal_per_hour, crystal_per_hour, deuterium_per_hour,
      metal_storage, crystal_storage, deuterium_storage
    )
    VALUES (
      new_planet_id, 500, 500, 0,
      30, 15, 0,
      10000, 10000, 10000
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Si hay colision de coordenadas, usar posicion aleatoria como fallback
    assigned_galaxy := floor(random() * 5 + 1)::int;
    assigned_system := floor(random() * 499 + 1)::int;
    assigned_position := floor(random() * 15 + 1)::int;
    
    INSERT INTO public.planets (
      id, user_id, name, galaxy, solar_system, position,
      is_main_planet, diameter, fields_max, temp_min, temp_max, image_id
    )
    VALUES (
      gen_random_uuid(), NEW.id, 'Planeta Principal',
      assigned_galaxy, assigned_system, assigned_position,
      true, 12800, 163, -20, 40, floor(random() * 10 + 1)::int
    )
    RETURNING id INTO new_planet_id;
    
    IF new_planet_id IS NOT NULL THEN
      INSERT INTO public.planet_resources (
        planet_id, metal, crystal, deuterium,
        metal_per_hour, crystal_per_hour, deuterium_per_hour,
        metal_storage, crystal_storage, deuterium_storage
      )
      VALUES (
        new_planet_id, 500, 500, 0,
        30, 15, 0,
        10000, 10000, 10000
      );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Asegurar que el trigger existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 5. CORREGIR COSTOS Y TIEMPOS SEGUN XNOVA ORIGINAL
-- ============================================

-- Corregir tiempos de construccion de naves (XNova usa formula diferente)
UPDATE ship_types SET 
  build_time_seconds = CASE code
    WHEN 'small_cargo' THEN 1200
    WHEN 'large_cargo' THEN 2400
    WHEN 'colony_ship' THEN 14400
    WHEN 'recycler' THEN 7200
    WHEN 'espionage_probe' THEN 120
    WHEN 'solar_satellite' THEN 600
    WHEN 'light_fighter' THEN 1080
    WHEN 'heavy_fighter' THEN 3600
    WHEN 'cruiser' THEN 10800
    WHEN 'battleship' THEN 21600
    WHEN 'battlecruiser' THEN 27000
    WHEN 'bomber' THEN 32400
    WHEN 'destroyer' THEN 43200
    WHEN 'deathstar' THEN 259200
    ELSE build_time_seconds
  END;

-- Corregir tiempos de defensas
UPDATE defense_types SET 
  build_time_seconds = CASE code
    WHEN 'rocket_launcher' THEN 480
    WHEN 'light_laser' THEN 600
    WHEN 'heavy_laser' THEN 2400
    WHEN 'gauss_cannon' THEN 10800
    WHEN 'ion_cannon' THEN 3600
    WHEN 'plasma_turret' THEN 28800
    WHEN 'small_shield_dome' THEN 7200
    WHEN 'large_shield_dome' THEN 21600
    WHEN 'anti_ballistic_missile' THEN 1800
    WHEN 'interplanetary_missile' THEN 3600
    ELSE build_time_seconds
  END;

-- Corregir consumo de combustible de naves
UPDATE ship_types SET 
  fuel_consumption = CASE code
    WHEN 'small_cargo' THEN 10
    WHEN 'large_cargo' THEN 50
    WHEN 'colony_ship' THEN 1000
    WHEN 'recycler' THEN 300
    WHEN 'espionage_probe' THEN 1
    WHEN 'solar_satellite' THEN 0
    WHEN 'light_fighter' THEN 20
    WHEN 'heavy_fighter' THEN 75
    WHEN 'cruiser' THEN 300
    WHEN 'battleship' THEN 500
    WHEN 'battlecruiser' THEN 250
    WHEN 'bomber' THEN 1000
    WHEN 'destroyer' THEN 1000
    WHEN 'deathstar' THEN 1
    WHEN 'star_destroyer' THEN 5000
    WHEN 'black_moon' THEN 10000
    ELSE fuel_consumption
  END;
