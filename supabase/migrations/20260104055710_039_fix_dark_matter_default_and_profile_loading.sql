/*
  # Correccion de Materia Oscura y Carga de Perfiles
  
  1. Problema Identificado
    - La columna dark_matter podia tener valores NULL
    - Esto causaba que se mostrara 0 en el frontend pero no se sumaran recompensas
    
  2. Solucion
    - Establecer default NOT NULL para dark_matter
    - Asegurar que todos los perfiles tengan dark_matter = 0 si es NULL
    - Mejorar trigger de creacion de usuario
*/

UPDATE profiles SET dark_matter = 0 WHERE dark_matter IS NULL;

ALTER TABLE profiles ALTER COLUMN dark_matter SET DEFAULT 0;
ALTER TABLE profiles ALTER COLUMN dark_matter SET NOT NULL;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_start_galaxy integer;
  v_start_system integer;
  v_start_position integer;
  v_planet_id uuid;
  v_attempts integer := 0;
  v_max_attempts integer := 100;
  v_position_found boolean := false;
BEGIN
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );
  
  IF EXISTS (SELECT 1 FROM profiles WHERE username = v_username) THEN
    v_username := v_username || '_' || substr(NEW.id::text, 1, 4);
  END IF;

  INSERT INTO profiles (id, username, email, dark_matter)
  VALUES (NEW.id, v_username, NEW.email, 0);

  WHILE NOT v_position_found AND v_attempts < v_max_attempts LOOP
    v_start_galaxy := 1 + floor(random() * 3)::integer;
    v_start_system := 1 + floor(random() * 200)::integer;
    v_start_position := 4 + floor(random() * 9)::integer;
    
    IF NOT EXISTS (
      SELECT 1 FROM planets 
      WHERE galaxy = v_start_galaxy 
      AND solar_system = v_start_system 
      AND position = v_start_position
    ) THEN
      v_position_found := true;
    END IF;
    
    v_attempts := v_attempts + 1;
  END LOOP;

  IF NOT v_position_found THEN
    v_start_galaxy := 1;
    v_start_system := 1;
    v_start_position := 1;
    
    WHILE EXISTS (
      SELECT 1 FROM planets 
      WHERE galaxy = v_start_galaxy 
      AND solar_system = v_start_system 
      AND position = v_start_position
    ) LOOP
      v_start_position := v_start_position + 1;
      IF v_start_position > 15 THEN
        v_start_position := 1;
        v_start_system := v_start_system + 1;
        IF v_start_system > 400 THEN
          v_start_system := 1;
          v_start_galaxy := v_start_galaxy + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO planets (
    user_id,
    name,
    galaxy,
    solar_system,
    position,
    planet_type,
    diameter,
    fields_max,
    fields_used,
    temperature_min,
    temperature_max,
    is_main_planet
  ) VALUES (
    NEW.id,
    'Planeta Principal',
    v_start_galaxy,
    v_start_system,
    v_start_position,
    'planet',
    12800,
    163,
    0,
    -20 + floor(random() * 60)::integer,
    20 + floor(random() * 60)::integer,
    true
  )
  RETURNING id INTO v_planet_id;

  INSERT INTO planet_resources (
    planet_id,
    metal,
    crystal,
    deuterium,
    metal_per_hour,
    crystal_per_hour,
    deuterium_per_hour,
    energy_used,
    energy_max
  ) VALUES (
    v_planet_id,
    500,
    300,
    100,
    30,
    15,
    0,
    0,
    0
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;