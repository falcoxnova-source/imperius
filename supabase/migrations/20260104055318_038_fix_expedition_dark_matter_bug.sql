/*
  # Correccion de Bug en Sistema de Expediciones
  
  1. Problema Identificado
    - Cuando el usuario no tiene investigacion de astrofisica, v_astrophysics_level quedaba NULL
    - Esto causaba que el calculo de materia oscura resultara en NULL
    - El mensaje mostraba vacio y no se agregaba materia oscura al perfil
    
  2. Solucion
    - Usar funcion COALESCE correctamente para manejar caso de query sin resultados
    - Asegurar que v_astrophysics_level siempre tenga un valor numerico (0 por defecto)
*/

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
  v_astrophysics_level integer := 0;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Flota no encontrada');
  END IF;
  
  v_user_id := v_fleet.user_id;
  
  SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = v_user_id AND tt.code = 'astrophysics';
  
  IF v_astrophysics_level IS NULL THEN
    v_astrophysics_level := 0;
  END IF;
  
  SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
  INTO v_cargo_capacity
  FROM fleet_ships fs
  JOIN ship_types st ON fs.ship_type_id = st.id
  WHERE fs.fleet_id = p_fleet_id;
  
  v_event_roll := random() * 100;
  
  IF v_event_roll < 3 THEN
    v_fleet_lost := true;
    v_message_subject := 'Expedicion Perdida - Agujero Negro';
    v_message_body := 'Tu flota de expedicion fue tragada por un agujero negro. No hubo sobrevivientes.';
    
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 8 THEN
    v_message_subject := 'Expedicion - Emboscada Pirata';
    v_message_body := 'Tu flota fue emboscada por piratas espaciales. Lograste escapar pero con perdidas.';
    
    UPDATE fleet_ships 
    SET quantity = GREATEST(1, FLOOR(quantity * (0.6 + random() * 0.2)))
    WHERE fleet_id = p_fleet_id;
    
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 15 THEN
    v_message_subject := 'Expedicion - Sin Hallazgos';
    v_message_body := 'Tu flota exploro el espacio profundo pero no encontro nada de valor.';
    
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 35 THEN
    v_dark_matter_reward := 50 + floor(random() * 150)::integer + (v_astrophysics_level * 10);
    v_message_subject := 'Expedicion - Materia Oscura Encontrada';
    v_message_body := 'Tu flota ha descubierto ' || v_dark_matter_reward::text || ' unidades de Materia Oscura flotando en el espacio.';
    
    UPDATE profiles 
    SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward 
    WHERE id = v_user_id;
    
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 55 THEN
    v_metal_reward := LEAST(v_cargo_capacity * 0.4, (5000 + floor(random() * 20000) * (1 + v_astrophysics_level * 0.1)));
    v_crystal_reward := LEAST(v_cargo_capacity * 0.3, (3000 + floor(random() * 15000) * (1 + v_astrophysics_level * 0.1)));
    v_deuterium_reward := LEAST(v_cargo_capacity * 0.3, (1000 + floor(random() * 10000) * (1 + v_astrophysics_level * 0.1)));
    
    v_message_subject := 'Expedicion - Recursos Encontrados';
    v_message_body := 'Tu flota encontro recursos abandonados: ' || floor(v_metal_reward)::text || ' Metal, ' || floor(v_crystal_reward)::text || ' Cristal, ' || floor(v_deuterium_reward)::text || ' Deuterio.';
    
    UPDATE fleets 
    SET 
      cargo_metal = cargo_metal + v_metal_reward,
      cargo_crystal = cargo_crystal + v_crystal_reward,
      cargo_deuterium = cargo_deuterium + v_deuterium_reward,
      is_returning = true
    WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 75 THEN
    SELECT * INTO v_ship_type
    FROM ship_types
    WHERE code NOT IN ('deathstar', 'colony_ship')
    AND base_speed > 0
    ORDER BY random()
    LIMIT 1;
    
    IF FOUND THEN
      v_ship_quantity := 1 + floor(random() * (5 + v_astrophysics_level))::integer;
      v_ships_found := jsonb_build_array(jsonb_build_object('ship_type_id', v_ship_type.id, 'name', v_ship_type.name, 'quantity', v_ship_quantity));
      
      INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
      VALUES (p_fleet_id, v_ship_type.id, v_ship_quantity)
      ON CONFLICT (fleet_id, ship_type_id)
      DO UPDATE SET quantity = fleet_ships.quantity + v_ship_quantity;
      
      v_message_subject := 'Expedicion - Naves Abandonadas';
      v_message_body := 'Tu flota encontro ' || v_ship_quantity::text || ' ' || v_ship_type.name || ' abandonadas a la deriva. Se han unido a tu flota.';
    ELSE
      v_message_subject := 'Expedicion - Sin Hallazgos';
      v_message_body := 'Tu flota exploro el espacio profundo pero no encontro nada de valor.';
    END IF;
    
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
    
  ELSIF v_event_roll < 90 THEN
    v_metal_reward := LEAST(v_cargo_capacity * 0.3, (3000 + floor(random() * 10000)));
    v_crystal_reward := LEAST(v_cargo_capacity * 0.3, (2000 + floor(random() * 8000)));
    v_dark_matter_reward := 20 + floor(random() * 80)::integer;
    
    v_message_subject := 'Expedicion - Gran Descubrimiento';
    v_message_body := 'Tu flota hizo un gran descubrimiento: ' || floor(v_metal_reward)::text || ' Metal, ' || floor(v_crystal_reward)::text || ' Cristal y ' || v_dark_matter_reward::text || ' Materia Oscura.';
    
    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward WHERE id = v_user_id;
    
    UPDATE fleets 
    SET 
      cargo_metal = cargo_metal + v_metal_reward,
      cargo_crystal = cargo_crystal + v_crystal_reward,
      is_returning = true
    WHERE id = p_fleet_id;
    
  ELSE
    v_dark_matter_reward := 200 + floor(random() * 300)::integer + (v_astrophysics_level * 25);
    v_message_subject := 'Expedicion - Artefacto Antiguo';
    v_message_body := 'Tu flota descubrio un antiguo artefacto alienigena que contenia ' || v_dark_matter_reward::text || ' unidades de Materia Oscura concentrada!';
    
    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward WHERE id = v_user_id;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END IF;
  
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