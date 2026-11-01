/*
  # Fix: Clear debris field when moon is created

  BUG: When a moon is created from debris after battle, the debris field
  remains on the map. In the original game, debris forms INTO the moon,
  so it should be consumed/cleared.

  FIX: Add DELETE FROM debris_fields inside check_moon_creation,
  right after the moon is successfully created. This way it works
  automatically for all callers (attack, ACS, destroy).

  ONLY the debris clearing logic is added. Moon creation logic is untouched.
*/

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
    
    -- Crear la luna
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

    -- FIX: Los escombros se fusionaron en la luna, eliminar campo de escombros
    DELETE FROM debris_fields
    WHERE galaxy = p_galaxy
      AND solar_system = p_system
      AND position = p_position;
  END IF;
  
  RETURN jsonb_build_object(
    'moon_created', v_moon_created,
    'moon_chance', v_moon_chance,
    'moon_diameter', CASE WHEN v_moon_created THEN v_moon_diameter ELSE NULL END,
    'total_debris', v_total_debris
  );
END;
$$;
