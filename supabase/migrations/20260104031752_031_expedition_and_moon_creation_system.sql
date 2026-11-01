/*
  # Sistema de Expediciones y Creacion de Lunas

  1. Cambios
    - Actualizar debris_fields para permitir posicion 16 (espacio profundo)
    - Crear funcion mejorada de expediciones con recompensas variadas
    - Agregar sistema de creacion de lunas por probabilidad de escombros
    
  2. Recompensas de Expedicion
    - Recursos (metal, cristal, deuterio)
    - Materia oscura
    - Naves abandonadas
    - Eventos especiales (piratas, agujeros negros)
    
  3. Creacion de Lunas
    - Probabilidad basada en cantidad de escombros (max 20%)
    - 100k escombros = 1% probabilidad
*/

-- Actualizar constraint de position en debris_fields para permitir 16
ALTER TABLE debris_fields DROP CONSTRAINT IF EXISTS debris_fields_position_check;
ALTER TABLE debris_fields ADD CONSTRAINT debris_fields_position_check CHECK (position >= 1 AND position <= 16);

-- Funcion mejorada para procesar expediciones
CREATE OR REPLACE FUNCTION process_expedition(p_fleet_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet record;
  v_user_id uuid;
  v_event_roll numeric;
  v_result jsonb;
  v_message_subject text;
  v_message_body text;
  v_metal_reward numeric := 0;
  v_crystal_reward numeric := 0;
  v_deuterium_reward numeric := 0;
  v_dark_matter_reward integer := 0;
  v_ships_found jsonb := '[]'::jsonb;
  v_cargo_capacity numeric;
  v_ship_type record;
  v_ship_quantity integer;
  v_fleet_lost boolean := false;
  v_astrophysics_level integer;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Flota no encontrada');
  END IF;
  
  v_user_id := v_fleet.user_id;
  
  -- Obtener nivel de astrofisica para mejores recompensas
  SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = v_user_id AND tt.code = 'astrophysics';
  
  -- Calcular capacidad de carga de la flota
  SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
  INTO v_cargo_capacity
  FROM fleet_ships fs
  JOIN ship_types st ON fs.ship_type_id = st.id
  WHERE fs.fleet_id = p_fleet_id;
  
  -- Generar evento aleatorio (0-100)
  v_event_roll := random() * 100;
  
  -- Eventos de expedicion
  IF v_event_roll < 3 THEN
    -- 3% - Agujero negro - PIERDE TODA LA FLOTA
    v_fleet_lost := true;
    v_message_subject := 'Expedicion Perdida - Agujero Negro';
    v_message_body := 'Tu flota de expedicion fue tragada por un agujero negro. No hubo sobrevivientes.';
    
    -- Eliminar flota
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 8 THEN
    -- 5% - Piratas espaciales - Combate (pierde algunas naves)
    v_message_subject := 'Expedicion - Emboscada Pirata';
    v_message_body := 'Tu flota fue emboscada por piratas espaciales. Lograste escapar pero con perdidas.';
    
    -- Reducir cantidad de naves en un 20-40%
    UPDATE fleet_ships 
    SET quantity = GREATEST(1, FLOOR(quantity * (0.6 + random() * 0.2)))
    WHERE fleet_id = p_fleet_id;
    
    -- Marcar como regresando
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 15 THEN
    -- 7% - Nada encontrado
    v_message_subject := 'Expedicion - Sin Hallazgos';
    v_message_body := 'Tu flota exploro el espacio profundo pero no encontro nada de valor.';
    
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 35 THEN
    -- 20% - Materia Oscura
    v_dark_matter_reward := (50 + floor(random() * 150) + (v_astrophysics_level * 10))::integer;
    v_message_subject := 'Expedicion - Materia Oscura Encontrada';
    v_message_body := format('Tu flota ha descubierto %s unidades de Materia Oscura flotando en el espacio.', v_dark_matter_reward);
    
    -- Agregar materia oscura al usuario
    UPDATE profiles 
    SET dark_matter = dark_matter + v_dark_matter_reward 
    WHERE id = v_user_id;
    
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 55 THEN
    -- 20% - Recursos
    v_metal_reward := LEAST(v_cargo_capacity * 0.4, (5000 + floor(random() * 20000) * (1 + v_astrophysics_level * 0.1)));
    v_crystal_reward := LEAST(v_cargo_capacity * 0.3, (3000 + floor(random() * 15000) * (1 + v_astrophysics_level * 0.1)));
    v_deuterium_reward := LEAST(v_cargo_capacity * 0.3, (1000 + floor(random() * 10000) * (1 + v_astrophysics_level * 0.1)));
    
    v_message_subject := 'Expedicion - Recursos Encontrados';
    v_message_body := format('Tu flota encontro recursos abandonados: %s Metal, %s Cristal, %s Deuterio.', 
      floor(v_metal_reward), floor(v_crystal_reward), floor(v_deuterium_reward));
    
    UPDATE fleets 
    SET 
      cargo_metal = cargo_metal + v_metal_reward,
      cargo_crystal = cargo_crystal + v_crystal_reward,
      cargo_deuterium = cargo_deuterium + v_deuterium_reward,
      is_returning = true
    WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 75 THEN
    -- 20% - Naves abandonadas
    -- Seleccionar tipo de nave aleatoria que no sea deathstar
    SELECT * INTO v_ship_type
    FROM ship_types
    WHERE code NOT IN ('deathstar', 'colony_ship')
    AND base_speed > 0
    ORDER BY random()
    LIMIT 1;
    
    IF FOUND THEN
      v_ship_quantity := 1 + floor(random() * (5 + v_astrophysics_level))::integer;
      v_ships_found := jsonb_build_array(jsonb_build_object('ship_type_id', v_ship_type.id, 'name', v_ship_type.name, 'quantity', v_ship_quantity));
      
      -- Agregar naves a la flota
      INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
      VALUES (p_fleet_id, v_ship_type.id, v_ship_quantity)
      ON CONFLICT (fleet_id, ship_type_id)
      DO UPDATE SET quantity = fleet_ships.quantity + v_ship_quantity;
      
      v_message_subject := 'Expedicion - Naves Abandonadas';
      v_message_body := format('Tu flota encontro %s %s abandonadas a la deriva. Se han unido a tu flota.', v_ship_quantity, v_ship_type.name);
    ELSE
      v_message_subject := 'Expedicion - Sin Hallazgos';
      v_message_body := 'Tu flota exploro el espacio profundo pero no encontro nada de valor.';
    END IF;
    
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 90 THEN
    -- 15% - Recursos + Materia oscura
    v_metal_reward := LEAST(v_cargo_capacity * 0.3, (3000 + floor(random() * 10000)));
    v_crystal_reward := LEAST(v_cargo_capacity * 0.3, (2000 + floor(random() * 8000)));
    v_dark_matter_reward := (20 + floor(random() * 80))::integer;
    
    v_message_subject := 'Expedicion - Gran Descubrimiento';
    v_message_body := format('Tu flota hizo un gran descubrimiento: %s Metal, %s Cristal y %s Materia Oscura.', 
      floor(v_metal_reward), floor(v_crystal_reward), v_dark_matter_reward);
    
    UPDATE profiles SET dark_matter = dark_matter + v_dark_matter_reward WHERE id = v_user_id;
    
    UPDATE fleets 
    SET 
      cargo_metal = cargo_metal + v_metal_reward,
      cargo_crystal = cargo_crystal + v_crystal_reward,
      is_returning = true
    WHERE id = p_fleet_id;
    
  ELSE
    -- 10% - Evento especial - Antiguo artefacto (mucha materia oscura)
    v_dark_matter_reward := (200 + floor(random() * 300) + (v_astrophysics_level * 25))::integer;
    v_message_subject := 'Expedicion - Artefacto Antiguo';
    v_message_body := format('Tu flota descubrio un antiguo artefacto alienigena que contenia %s unidades de Materia Oscura concentrada!', v_dark_matter_reward);
    
    UPDATE profiles SET dark_matter = dark_matter + v_dark_matter_reward WHERE id = v_user_id;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END IF;
  
  -- Enviar mensaje de resultado
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (NULL, v_user_id, v_message_subject, v_message_body, 'expedition');
  
  RETURN jsonb_build_object(
    'success', true,
    'event_type', CASE
      WHEN v_fleet_lost THEN 'black_hole'
      WHEN v_event_roll < 8 THEN 'pirates'
      WHEN v_event_roll < 15 THEN 'nothing'
      WHEN v_event_roll < 35 THEN 'dark_matter'
      WHEN v_event_roll < 55 THEN 'resources'
      WHEN v_event_roll < 75 THEN 'ships'
      WHEN v_event_roll < 90 THEN 'resources_and_dm'
      ELSE 'artifact'
    END,
    'metal', v_metal_reward,
    'crystal', v_crystal_reward,
    'deuterium', v_deuterium_reward,
    'dark_matter', v_dark_matter_reward,
    'ships_found', v_ships_found,
    'fleet_lost', v_fleet_lost
  );
END;
$$ LANGUAGE plpgsql;

-- Funcion para verificar y crear luna despues de combate
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
      temperature_min,
      temperature_max,
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
      1 + floor(v_moon_diameter / 1000),
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
$$ LANGUAGE plpgsql;

-- Actualizar process_fleet_arrival para usar las nuevas funciones
CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fleet_record RECORD;
  target_planet RECORD;
  ship_record RECORD;
  total_cargo_capacity INTEGER;
  loot_metal NUMERIC;
  loot_crystal NUMERIC;
  loot_deuterium NUMERIC;
  v_debris_metal NUMERIC;
  v_debris_crystal NUMERIC;
  v_attacker_ships jsonb;
  v_defender_ships jsonb;
  v_defender_defenses jsonb;
  v_total_attacker_struct NUMERIC;
  v_total_defender_struct NUMERIC;
  v_moon_result jsonb;
BEGIN
  SELECT * INTO fleet_record FROM fleets WHERE id = p_fleet_id AND is_completed = false;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF fleet_record.arrival_time > NOW() AND NOT fleet_record.is_returning THEN
    RETURN;
  END IF;

  IF fleet_record.is_returning AND fleet_record.return_time > NOW() THEN
    RETURN;
  END IF;

  IF fleet_record.is_returning THEN
    FOR ship_record IN
      SELECT fs.ship_type_id, fs.quantity
      FROM fleet_ships fs
      WHERE fs.fleet_id = p_fleet_id
    LOOP
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (fleet_record.origin_planet_id, ship_record.ship_type_id, ship_record.quantity)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
    END LOOP;

    UPDATE planet_resources
    SET
      metal = metal + fleet_record.cargo_metal,
      crystal = crystal + fleet_record.cargo_crystal,
      deuterium = deuterium + fleet_record.cargo_deuterium
    WHERE planet_id = fleet_record.origin_planet_id;

    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    RETURN;
  END IF;

  CASE fleet_record.mission_type
    WHEN 'expedition' THEN
      PERFORM process_expedition(p_fleet_id);

    WHEN 'espionage' THEN
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position
      AND p.planet_type = 'planet';

      IF FOUND AND target_planet.user_id IS NOT NULL THEN
        PERFORM generate_espionage_report(
          fleet_record.user_id,
          target_planet.id,
          target_planet.user_id
        );
      END IF;
      
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

    WHEN 'transport' THEN
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position;

      IF FOUND THEN
        UPDATE planet_resources
        SET
          metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
        WHERE planet_id = target_planet.id;

        UPDATE fleets
        SET
          cargo_metal = 0,
          cargo_crystal = 0,
          cargo_deuterium = 0,
          is_returning = true
        WHERE id = p_fleet_id;
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;

    WHEN 'deploy' THEN
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position
      AND p.user_id = fleet_record.user_id;

      IF FOUND THEN
        FOR ship_record IN
          SELECT fs.ship_type_id, fs.quantity
          FROM fleet_ships fs
          WHERE fs.fleet_id = p_fleet_id
        LOOP
          INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
          VALUES (target_planet.id, ship_record.ship_type_id, ship_record.quantity)
          ON CONFLICT (planet_id, ship_type_id)
          DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
        END LOOP;

        UPDATE planet_resources
        SET
          metal = metal + fleet_record.cargo_metal,
          crystal = crystal + fleet_record.cargo_crystal,
          deuterium = deuterium + fleet_record.cargo_deuterium
        WHERE planet_id = target_planet.id;

        DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
        UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;

    WHEN 'recycle' THEN
      DECLARE
        debris RECORD;
        recycler_capacity INTEGER;
        collected_metal NUMERIC;
        collected_crystal NUMERIC;
      BEGIN
        SELECT * INTO debris
        FROM debris_fields
        WHERE galaxy = fleet_record.target_galaxy
        AND solar_system = fleet_record.target_system
        AND position = fleet_record.target_position;

        IF FOUND AND (debris.metal > 0 OR debris.crystal > 0) THEN
          SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
          INTO recycler_capacity
          FROM fleet_ships fs
          JOIN ship_types st ON fs.ship_type_id = st.id
          WHERE fs.fleet_id = p_fleet_id AND st.code = 'recycler';

          collected_metal := LEAST(debris.metal, recycler_capacity / 2);
          collected_crystal := LEAST(debris.crystal, recycler_capacity / 2);

          UPDATE debris_fields
          SET
            metal = metal - collected_metal,
            crystal = crystal - collected_crystal,
            updated_at = NOW()
          WHERE id = debris.id;

          DELETE FROM debris_fields WHERE id = debris.id AND metal <= 0 AND crystal <= 0;

          UPDATE fleets
          SET
            cargo_metal = cargo_metal + collected_metal,
            cargo_crystal = cargo_crystal + collected_crystal,
            is_returning = true
          WHERE id = p_fleet_id;
        ELSE
          UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
        END IF;
      END;

    WHEN 'colonize' THEN
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position;

      IF NOT FOUND THEN
        DECLARE
          colony_ship_type_id INTEGER;
          has_colony_ship BOOLEAN;
        BEGIN
          SELECT id INTO colony_ship_type_id FROM ship_types WHERE code = 'colony_ship';
          
          SELECT EXISTS(
            SELECT 1 FROM fleet_ships
            WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id AND quantity > 0
          ) INTO has_colony_ship;

          IF has_colony_ship THEN
            INSERT INTO planets (
              user_id,
              name,
              galaxy,
              solar_system,
              position,
              planet_type,
              is_main_planet
            ) VALUES (
              fleet_record.user_id,
              'Colonia',
              fleet_record.target_galaxy,
              fleet_record.target_system,
              fleet_record.target_position,
              'planet',
              false
            );

            UPDATE fleet_ships
            SET quantity = quantity - 1
            WHERE fleet_id = p_fleet_id AND ship_type_id = colony_ship_type_id;
            
            DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id AND quantity <= 0;

            INSERT INTO messages (
              sender_id,
              recipient_id,
              subject,
              body,
              message_type
            ) VALUES (
              NULL,
              fleet_record.user_id,
              'Colonia Establecida',
              format('Se ha establecido una nueva colonia en [%s:%s:%s]', 
                fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position),
              'system'
            );
          END IF;
        END;
      END IF;
      
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

    WHEN 'attack' THEN
      SELECT p.* INTO target_planet
      FROM planets p
      WHERE p.galaxy = fleet_record.target_galaxy
      AND p.solar_system = fleet_record.target_system
      AND p.position = fleet_record.target_position;

      IF FOUND AND target_planet.user_id IS NOT NULL AND target_planet.user_id != fleet_record.user_id THEN
        -- Obtener estructuras totales de atacante
        SELECT COALESCE(SUM(fs.quantity * (st.hull_points + st.shield_power)), 0)
        INTO v_total_attacker_struct
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id;
        
        -- Obtener estructuras totales de defensor (naves + defensas)
        SELECT COALESCE(SUM(ps.quantity * (st.hull_points + st.shield_power)), 0)
        INTO v_total_defender_struct
        FROM planet_ships ps
        JOIN ship_types st ON ps.ship_type_id = st.id
        WHERE ps.planet_id = target_planet.id;
        
        v_total_defender_struct := v_total_defender_struct + COALESCE((
          SELECT SUM(pd.quantity * (dt.hull_points + dt.shield_power))
          FROM planet_defenses pd
          JOIN defense_types dt ON pd.defense_type_id = dt.id
          WHERE pd.planet_id = target_planet.id
        ), 0);
        
        SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
        INTO total_cargo_capacity
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = p_fleet_id;

        SELECT 
          LEAST(metal * 0.5, total_cargo_capacity / 3),
          LEAST(crystal * 0.5, total_cargo_capacity / 3),
          LEAST(deuterium * 0.5, total_cargo_capacity / 3)
        INTO loot_metal, loot_crystal, loot_deuterium
        FROM planet_resources WHERE planet_id = target_planet.id;

        UPDATE planet_resources
        SET
          metal = metal - loot_metal,
          crystal = crystal - loot_crystal,
          deuterium = deuterium - loot_deuterium
        WHERE planet_id = target_planet.id;

        UPDATE fleets
        SET
          cargo_metal = cargo_metal + loot_metal,
          cargo_crystal = cargo_crystal + loot_crystal,
          cargo_deuterium = cargo_deuterium + loot_deuterium,
          is_returning = true
        WHERE id = p_fleet_id;

        -- Calcular escombros basados en perdidas de batalla (30% del total destruido)
        v_debris_metal := (v_total_attacker_struct + v_total_defender_struct) * 0.3 * 0.5;
        v_debris_crystal := (v_total_attacker_struct + v_total_defender_struct) * 0.3 * 0.3;
        
        -- Crear campo de escombros
        INSERT INTO debris_fields (galaxy, solar_system, position, metal, crystal)
        VALUES (
          fleet_record.target_galaxy,
          fleet_record.target_system,
          fleet_record.target_position,
          v_debris_metal,
          v_debris_crystal
        )
        ON CONFLICT (galaxy, solar_system, position)
        DO UPDATE SET
          metal = debris_fields.metal + v_debris_metal,
          crystal = debris_fields.crystal + v_debris_crystal,
          updated_at = NOW();
        
        -- Verificar creacion de luna
        v_moon_result := check_moon_creation(
          fleet_record.target_galaxy,
          fleet_record.target_system,
          fleet_record.target_position,
          v_debris_metal,
          v_debris_crystal
        );

        INSERT INTO messages (
          sender_id,
          recipient_id,
          subject,
          body,
          message_type
        ) VALUES (
          NULL,
          fleet_record.user_id,
          'Reporte de Combate',
          format('Has atacado %s en [%s:%s:%s]. Botin: %s Metal, %s Cristal, %s Deuterio. Escombros: %s Metal, %s Cristal.%s',
            target_planet.name, 
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            floor(loot_metal), floor(loot_crystal), floor(loot_deuterium),
            floor(v_debris_metal), floor(v_debris_crystal),
            CASE WHEN (v_moon_result->>'moon_created')::boolean THEN ' Una luna ha sido creada!' ELSE '' END),
          'battle'
        );

        INSERT INTO messages (
          sender_id,
          recipient_id,
          subject,
          body,
          message_type
        ) VALUES (
          NULL,
          target_planet.user_id,
          'Tu planeta fue atacado!',
          format('Tu planeta %s en [%s:%s:%s] fue atacado. Perdiste recursos.%s',
            target_planet.name,
            fleet_record.target_galaxy, fleet_record.target_system, fleet_record.target_position,
            CASE WHEN (v_moon_result->>'moon_created')::boolean THEN ' Una luna ha aparecido!' ELSE '' END),
          'battle'
        );
      ELSE
        UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
      END IF;

    ELSE
      UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END CASE;
END;
$$ LANGUAGE plpgsql;