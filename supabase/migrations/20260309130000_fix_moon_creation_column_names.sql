/*
  # Fix Moon Creation - Column Name Mismatch

  BUG 1: `check_moon_creation` uses `temperature_min` / `temperature_max` columns
         but the `planets` table has `temp_min` / `temp_max`.
         This causes the INSERT to fail silently, so moons are NEVER created.

  BUG 2: `process_fleet_arrival` reads `v_moon_result->>'probability'` but
         `check_moon_creation` returns the key as `'moon_chance'`.
         This causes the moon probability text to show NULL.

  FIX: Recreate `check_moon_creation` with correct column names,
       and patch `process_fleet_arrival` to read `'moon_chance'` key.
*/

-- ==========================================================================
-- FIX 1: Recreate check_moon_creation with correct column names
-- ==========================================================================
CREATE OR REPLACE FUNCTION check_moon_creation(
  p_galaxy integer,
  p_system integer,
  p_position integer,
  p_debris_metal numeric,
  p_debris_crystal numeric
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_debris numeric;
  v_moon_chance numeric;
  v_existing_moon record;
  v_planet record;
  v_moon_created boolean := false;
  v_moon_diameter integer;
  v_new_moon_id uuid;
BEGIN
  -- Verificar si ya existe una luna en esa posicion
  SELECT * INTO v_existing_moon
  FROM planets
  WHERE galaxy = p_galaxy
    AND solar_system = p_system
    AND position = p_position
    AND planet_type = 'moon';
  
  IF FOUND THEN
    RETURN jsonb_build_object('moon_created', false, 'reason', 'Ya existe una luna');
  END IF;
  
  -- Obtener planeta principal para el propietario
  SELECT * INTO v_planet
  FROM planets
  WHERE galaxy = p_galaxy
    AND solar_system = p_system
    AND position = p_position
    AND planet_type = 'planet'
    AND user_id IS NOT NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('moon_created', false, 'reason', 'No hay planeta');
  END IF;
  
  -- Calcular probabilidad de luna
  -- Cada 100.000 unidades de escombros = 1% de probabilidad (max 20%)
  v_total_debris := p_debris_metal + p_debris_crystal;
  v_moon_chance := LEAST(20, v_total_debris / 100000);
  
  -- Tirar dados para creacion de luna
  IF random() * 100 < v_moon_chance THEN
    v_moon_created := true;
    
    -- Calcular diametro de la luna (basado en escombros, entre 3474 y 8944 km)
    v_moon_diameter := LEAST(8944, GREATEST(3474, 3474 + floor(v_total_debris / 50000) * 100));
    
    -- Crear la luna (FIX: usar temp_min/temp_max en vez de temperature_min/temperature_max)
    INSERT INTO planets (
      user_id,
      name,
      galaxy,
      solar_system,
      position,
      planet_type,
      diameter,
      temp_min,
      temp_max,
      fields_max,
      is_main_planet
    ) VALUES (
      v_planet.user_id,
      'Luna',
      p_galaxy,
      p_system,
      p_position,
      'moon',
      v_moon_diameter,
      -40,
      -20,
      1,
      false
    )
    RETURNING id INTO v_new_moon_id;
    
    -- Crear recursos iniciales para la luna
    INSERT INTO planet_resources (planet_id, metal, crystal, deuterium)
    VALUES (v_new_moon_id, 0, 0, 0);
    
    -- Notificar al propietario
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (
      NULL,
      v_planet.user_id,
      'Una Luna ha aparecido!',
      format('Los escombros de la batalla en [%s:%s:%s] se han fusionado y han formado una luna con un diametro de %s km!', 
        p_galaxy, p_system, p_position, v_moon_diameter),
      'system'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'moon_created', v_moon_created,
    'moon_chance', v_moon_chance,
    'moon_diameter', CASE WHEN v_moon_created THEN v_moon_diameter ELSE NULL END,
    'total_debris', v_total_debris
  );
END;
$$;

-- ==========================================================================
-- FIX 2: Patch process_fleet_arrival to read 'moon_chance' instead of 'probability'
-- ==========================================================================
DO $$
DECLARE
  v_func_body text;
BEGIN
  SELECT prosrc INTO v_func_body
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival';

  IF v_func_body IS NULL THEN
    RAISE NOTICE 'process_fleet_arrival not found, skipping';
    RETURN;
  END IF;

  -- Replace 'probability' key with 'moon_chance' key
  v_func_body := replace(
    v_func_body,
    $key$(v_moon_result->>''probability'')::numeric$key$,
    $key$(v_moon_result->>''moon_chance'')::numeric$key$
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
    v_func_body
  );

  RAISE NOTICE 'fix_moon_creation: patched process_fleet_arrival to use moon_chance key';
END $$;
