/*
  # Expedition Cargo Capacity Limit
  
  ## Summary
  Fixes expedition resource rewards to properly respect fleet cargo capacity.
  
  ## Problem
  - Expeditions were returning more resources than the fleet could carry
  - Small ships like espionage probes (very low cargo) were bringing back massive amounts
  - This causes inflation in the game economy
  
  ## Solution
  - Calculate total available cargo capacity
  - Calculate current cargo already in fleet
  - Generate random resources but cap total to available space
  - Distribute capacity fairly between metal, crystal, and deuterium
  - Show message indicating how much was found vs how much could be carried
  
  ## Changes
  - Updated process_expedition function with proper cargo limits
*/

CREATE OR REPLACE FUNCTION process_expedition(p_fleet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
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
  v_metal_found numeric := 0;
  v_crystal_found numeric := 0;
  v_deuterium_found numeric := 0;
  v_dark_matter_reward integer := 0;
  v_ships_found jsonb := '[]'::jsonb;
  v_cargo_capacity numeric;
  v_current_cargo numeric;
  v_available_cargo numeric;
  v_total_resources_found numeric;
  v_ship_type record;
  v_ship_quantity integer;
  v_fleet_lost boolean := false;
  v_astrophysics_level integer := 0;
  v_jackpot_result jsonb;
  v_jackpot_won boolean := false;
  v_jackpot_amount numeric := 0;
  v_cargo_full boolean := false;
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

  -- Calculate total cargo capacity of the fleet
  SELECT COALESCE(SUM(fs.quantity * st.cargo_capacity), 0)
  INTO v_cargo_capacity
  FROM fleet_ships fs
  JOIN ship_types st ON fs.ship_type_id = st.id
  WHERE fs.fleet_id = p_fleet_id;

  -- Calculate current cargo already in fleet
  v_current_cargo := COALESCE(v_fleet.cargo_metal, 0) + COALESCE(v_fleet.cargo_crystal, 0) + COALESCE(v_fleet.cargo_deuterium, 0);
  
  -- Calculate available cargo space
  v_available_cargo := GREATEST(0, v_cargo_capacity - v_current_cargo);

  v_event_roll := random() * 100;

  IF v_event_roll < 3 THEN
    -- Black hole - fleet lost
    v_fleet_lost := true;
    v_message_subject := 'Expedicion Perdida - Agujero Negro';
    v_message_body := 'Tu flota de expedicion fue tragada por un agujero negro. No hubo sobrevivientes.';

    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 8 THEN
    -- Pirate ambush - loses some ships
    v_message_subject := 'Expedicion - Emboscada Pirata';
    v_message_body := 'Tu flota fue emboscada por piratas espaciales. Lograste escapar pero con perdidas.';

    UPDATE fleet_ships 
    SET quantity = GREATEST(1, FLOOR(quantity * (0.6 + random() * 0.2)))
    WHERE fleet_id = p_fleet_id;

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 15 THEN
    -- Nothing found
    v_message_subject := 'Expedicion - Sin Hallazgos';
    v_message_body := 'Tu flota exploro el espacio profundo pero no encontro nada de valor.';

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 35 THEN
    -- Dark matter only (doesn't use cargo)
    v_dark_matter_reward := 50 + floor(random() * 150)::integer + (v_astrophysics_level * 10);
    v_message_subject := 'Expedicion - Materia Oscura Encontrada';
    v_message_body := 'Tu flota ha descubierto ' || v_dark_matter_reward::text || ' unidades de Materia Oscura flotando en el espacio.';

    UPDATE profiles 
    SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward 
    WHERE id = v_user_id;

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 55 THEN
    -- Resources found - respect cargo capacity
    -- Calculate what was "found" (potential maximum)
    v_metal_found := (5000 + floor(random() * 20000) * (1 + v_astrophysics_level * 0.1));
    v_crystal_found := (3000 + floor(random() * 15000) * (1 + v_astrophysics_level * 0.1));
    v_deuterium_found := (1000 + floor(random() * 10000) * (1 + v_astrophysics_level * 0.1));
    v_total_resources_found := v_metal_found + v_crystal_found + v_deuterium_found;
    
    -- Limit to available cargo, distributing proportionally
    IF v_total_resources_found > v_available_cargo AND v_total_resources_found > 0 THEN
      v_cargo_full := true;
      v_metal_reward := floor(v_available_cargo * (v_metal_found / v_total_resources_found));
      v_crystal_reward := floor(v_available_cargo * (v_crystal_found / v_total_resources_found));
      v_deuterium_reward := floor(v_available_cargo * (v_deuterium_found / v_total_resources_found));
    ELSE
      v_metal_reward := floor(v_metal_found);
      v_crystal_reward := floor(v_crystal_found);
      v_deuterium_reward := floor(v_deuterium_found);
    END IF;

    v_message_subject := 'Expedicion - Recursos Encontrados';
    IF v_cargo_full THEN
      v_message_body := 'Tu flota encontro recursos abandonados: ' || floor(v_metal_found)::text || ' Metal, ' || floor(v_crystal_found)::text || ' Cristal, ' || floor(v_deuterium_found)::text || ' Deuterio. Sin embargo, solo pudieron cargar: ' || floor(v_metal_reward)::text || ' Metal, ' || floor(v_crystal_reward)::text || ' Cristal, ' || floor(v_deuterium_reward)::text || ' Deuterio debido a la capacidad de carga limitada.';
    ELSE
      v_message_body := 'Tu flota ha regresado de la expedicion con ' || floor(v_metal_reward)::text || ' Metal, ' || floor(v_crystal_reward)::text || ' Cristal y ' || floor(v_deuterium_reward)::text || ' Deuterio.';
    END IF;

    UPDATE fleets 
    SET 
      cargo_metal = cargo_metal + v_metal_reward,
      cargo_crystal = cargo_crystal + v_crystal_reward,
      cargo_deuterium = cargo_deuterium + v_deuterium_reward,
      is_returning = true
    WHERE id = p_fleet_id;

  ELSIF v_event_roll < 75 THEN
    -- Ships found - these are added to fleet, no cargo needed
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
    -- Resources + Dark Matter
    v_metal_found := (3000 + floor(random() * 10000));
    v_crystal_found := (2000 + floor(random() * 8000));
    v_total_resources_found := v_metal_found + v_crystal_found;
    v_dark_matter_reward := 20 + floor(random() * 80)::integer;

    -- Limit to available cargo, distributing proportionally
    IF v_total_resources_found > v_available_cargo AND v_total_resources_found > 0 THEN
      v_cargo_full := true;
      v_metal_reward := floor(v_available_cargo * (v_metal_found / v_total_resources_found));
      v_crystal_reward := floor(v_available_cargo * (v_crystal_found / v_total_resources_found));
    ELSE
      v_metal_reward := floor(v_metal_found);
      v_crystal_reward := floor(v_crystal_found);
    END IF;

    v_message_subject := 'Expedicion - Gran Descubrimiento';
    IF v_cargo_full THEN
      v_message_body := 'Tu flota hizo un gran descubrimiento: ' || floor(v_metal_found)::text || ' Metal y ' || floor(v_crystal_found)::text || ' Cristal. Solo pudieron cargar: ' || floor(v_metal_reward)::text || ' Metal y ' || floor(v_crystal_reward)::text || ' Cristal. Tambien encontraron ' || v_dark_matter_reward::text || ' Materia Oscura.';
    ELSE
      v_message_body := 'Tu flota hizo un gran descubrimiento: ' || floor(v_metal_reward)::text || ' Metal, ' || floor(v_crystal_reward)::text || ' Cristal y ' || v_dark_matter_reward::text || ' Materia Oscura.';
    END IF;

    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward WHERE id = v_user_id;

    UPDATE fleets 
    SET 
      cargo_metal = cargo_metal + v_metal_reward,
      cargo_crystal = cargo_crystal + v_crystal_reward,
      is_returning = true
    WHERE id = p_fleet_id;

  ELSE
    -- Ancient artifact - dark matter only (doesn't use cargo)
    v_dark_matter_reward := 200 + floor(random() * 300)::integer + (v_astrophysics_level * 25);
    v_message_subject := 'Expedicion - Artefacto Antiguo';
    v_message_body := 'Tu flota descubrio un antiguo artefacto alienigena que contenia ' || v_dark_matter_reward::text || ' unidades de Materia Oscura concentrada!';

    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward WHERE id = v_user_id;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END IF;

  -- Attempt jackpot win (only if fleet wasn't lost)
  IF NOT v_fleet_lost THEN
    v_jackpot_result := attempt_jackpot_win(v_user_id);
    v_jackpot_won := (v_jackpot_result->>'won')::boolean;
    v_jackpot_amount := COALESCE((v_jackpot_result->>'amount')::numeric, 0);
    
    IF v_jackpot_won THEN
      v_message_body := v_message_body || E'\n\n*** JACKPOT! Tu expedicion descubrio el tesoro legendario! Has ganado ' || floor(v_jackpot_amount)::text || ' FXU! ***';
    END IF;
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
    'fleet_lost', v_fleet_lost,
    'jackpot_won', v_jackpot_won,
    'jackpot_amount', v_jackpot_amount,
    'cargo_was_full', v_cargo_full
  );
END;
$$;
