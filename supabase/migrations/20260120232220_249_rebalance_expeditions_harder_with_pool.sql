/*
  # Rebalancear Expediciones - Mas Dificiles + Pool de Expediciones

  ## Cambios:
  
  1. **Nuevas probabilidades de eventos (mas dificiles)**:
     - 0-6% (6%): Agujero negro - pierde TODA la flota
     - 6-18% (12%): Piratas - pierde 40-70% de naves  
     - 18-26% (8%): Anomalia gravitacional - pierde 20-50% naves
     - 26-34% (8%): Tormenta de iones - dana 20-40% de naves
     - 34-50% (16%): Nada encontrado
     - Total negativo/neutral: 50%
     
     - 50-60% (10%): Materia oscura (cantidades reducidas)
     - 60-72% (12%): Recursos (cantidades reducidas)
     - 72-80% (8%): Naves encontradas
     - 80-88% (8%): Recursos + Materia oscura
     - 88-95% (7%): Artefacto antiguo
     - 95-100% (5%): Tesoro legendario (intento garantizado de pool)
     - Total positivo: 50%

  2. **Pool de Expediciones**:
     - Nueva funcion attempt_expedition_pool_win que usa el pool de expediciones (20%)
     - 5% de chance en cada expedicion exitosa
     - 100% de chance en evento "Tesoro legendario"
     - Gana 10-30% del pool

  3. **Recompensas reducidas**:
     - Materia oscura: 20-80 (antes 50-200)
     - Recursos: reducidos 40%
     - Naves: 1-3 (antes 1-6+)
*/

-- Funcion para intentar ganar del pool de expediciones
CREATE OR REPLACE FUNCTION attempt_expedition_pool_win(p_user_id uuid, p_guaranteed boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_balance numeric;
  v_roll numeric;
  v_win_chance numeric := 5;
  v_won boolean := false;
  v_win_amount numeric := 0;
  v_win_percent numeric;
  v_new_balance numeric;
BEGIN
  SELECT expedition_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;
  
  IF v_pool_balance IS NULL OR v_pool_balance < 10 THEN
    RETURN jsonb_build_object(
      'won', false,
      'amount', 0,
      'reason', 'pool_too_small',
      'current_pool', COALESCE(v_pool_balance, 0)
    );
  END IF;
  
  v_roll := random() * 100;
  
  IF p_guaranteed OR v_roll < v_win_chance THEN
    v_won := true;
    
    v_win_percent := 10 + (random() * 20);
    v_win_amount := floor(v_pool_balance * (v_win_percent / 100));
    
    IF v_win_amount < 1 THEN
      v_win_amount := 1;
    END IF;
    
    UPDATE jackpot_pools
    SET 
      expedition_balance = expedition_balance - v_win_amount,
      updated_at = now()
    WHERE id = 1
    RETURNING expedition_balance INTO v_new_balance;
    
    UPDATE jackpot
    SET 
      balance = balance - v_win_amount,
      total_won = total_won + v_win_amount,
      last_winner_id = p_user_id,
      last_won_at = now(),
      last_won_amount = v_win_amount,
      updated_at = now()
    WHERE id = 1;
    
    PERFORM _internal_set_fxu_context();
    
    UPDATE profiles
    SET fxu_balance = fxu_balance + v_win_amount
    WHERE id = p_user_id;
    
    INSERT INTO jackpot_history (user_id, type, amount, source, jackpot_balance_after)
    VALUES (p_user_id, 'win', v_win_amount, 'expedition_pool', v_new_balance);
  END IF;
  
  RETURN jsonb_build_object(
    'won', v_won,
    'amount', v_win_amount,
    'current_pool', CASE WHEN v_won THEN v_new_balance ELSE v_pool_balance END
  );
END;
$$;

-- Actualizar funcion process_expedition con nuevas probabilidades
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
  v_ships_lost jsonb := '[]'::jsonb;
  v_cargo_capacity numeric;
  v_current_cargo numeric;
  v_available_cargo numeric;
  v_total_resources_found numeric;
  v_ship_type record;
  v_ship_quantity integer;
  v_fleet_lost boolean := false;
  v_partial_loss boolean := false;
  v_loss_percent numeric := 0;
  v_astrophysics_level integer := 0;
  v_pool_result jsonb;
  v_pool_won boolean := false;
  v_pool_amount numeric := 0;
  v_cargo_full boolean := false;
  v_event_type text;
  v_ships_before jsonb;
  v_ships_lost_count integer := 0;
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

  v_current_cargo := COALESCE(v_fleet.cargo_metal, 0) + COALESCE(v_fleet.cargo_crystal, 0) + COALESCE(v_fleet.cargo_deuterium, 0);
  v_available_cargo := GREATEST(0, v_cargo_capacity - v_current_cargo);

  SELECT jsonb_agg(jsonb_build_object('ship_type_id', fs.ship_type_id, 'name', st.name, 'quantity', fs.quantity))
  INTO v_ships_before
  FROM fleet_ships fs
  JOIN ship_types st ON fs.ship_type_id = st.id
  WHERE fs.fleet_id = p_fleet_id;

  v_event_roll := random() * 100;

  -- ==========================================
  -- EVENTOS NEGATIVOS (50% total)
  -- ==========================================
  
  IF v_event_roll < 6 THEN
    -- AGUJERO NEGRO (6%) - Pierde toda la flota
    v_fleet_lost := true;
    v_event_type := 'black_hole';
    v_message_subject := 'Expedicion PERDIDA - Agujero Negro';
    v_message_body := 'DESASTRE! Tu flota de expedicion fue tragada por un agujero negro masivo. ' ||
                      'Las comunicaciones se cortaron abruptamente y no hubo senales de vida. ' ||
                      'Todas las naves y tripulacion se perdieron para siempre.';

    v_ships_lost := v_ships_before;
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 18 THEN
    -- PIRATAS (12%) - Pierde 40-70% de naves
    v_partial_loss := true;
    v_loss_percent := 40 + (random() * 30);
    v_event_type := 'pirates';
    v_message_subject := 'Expedicion - Emboscada Pirata Severa';
    v_message_body := 'Tu flota fue emboscada por una armada pirata bien organizada! ' ||
                      'Despues de una feroz batalla, lograron escapar pero con grandes perdidas. ' ||
                      'Aproximadamente ' || floor(v_loss_percent)::text || '% de tus naves fueron destruidas.';

    FOR v_ship_type IN 
      SELECT fs.ship_type_id, fs.quantity, st.name
      FROM fleet_ships fs
      JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = p_fleet_id
    LOOP
      v_ships_lost_count := floor(v_ship_type.quantity * v_loss_percent / 100);
      IF v_ships_lost_count > 0 THEN
        v_ships_lost := v_ships_lost || jsonb_build_object(
          'ship_type_id', v_ship_type.ship_type_id, 
          'name', v_ship_type.name, 
          'quantity', v_ships_lost_count
        );
      END IF;
    END LOOP;

    UPDATE fleet_ships 
    SET quantity = GREATEST(1, floor(quantity * (100 - v_loss_percent) / 100))
    WHERE fleet_id = p_fleet_id;

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 26 THEN
    -- ANOMALIA GRAVITACIONAL (8%) - Pierde 20-50% de naves
    v_partial_loss := true;
    v_loss_percent := 20 + (random() * 30);
    v_event_type := 'gravity_anomaly';
    v_message_subject := 'Expedicion - Anomalia Gravitacional';
    v_message_body := 'Tu flota se encontro con una anomalia gravitacional inesperada! ' ||
                      'Las fuerzas de marea extremas destrozaron varias naves antes de poder escapar. ' ||
                      'Perdiste aproximadamente ' || floor(v_loss_percent)::text || '% de tu flota.';

    FOR v_ship_type IN 
      SELECT fs.ship_type_id, fs.quantity, st.name
      FROM fleet_ships fs
      JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = p_fleet_id
    LOOP
      v_ships_lost_count := floor(v_ship_type.quantity * v_loss_percent / 100);
      IF v_ships_lost_count > 0 THEN
        v_ships_lost := v_ships_lost || jsonb_build_object(
          'ship_type_id', v_ship_type.ship_type_id, 
          'name', v_ship_type.name, 
          'quantity', v_ships_lost_count
        );
      END IF;
    END LOOP;

    UPDATE fleet_ships 
    SET quantity = GREATEST(1, floor(quantity * (100 - v_loss_percent) / 100))
    WHERE fleet_id = p_fleet_id;

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 34 THEN
    -- TORMENTA DE IONES (8%) - Pierde 20-40% de naves
    v_partial_loss := true;
    v_loss_percent := 20 + (random() * 20);
    v_event_type := 'ion_storm';
    v_message_subject := 'Expedicion - Tormenta de Iones';
    v_message_body := 'Una violenta tormenta de iones golpeo tu flota sin previo aviso! ' ||
                      'Los sistemas electronicos fallaron y varias naves colisionaron entre si. ' ||
                      'Perdidas estimadas: ' || floor(v_loss_percent)::text || '% de la flota.';

    FOR v_ship_type IN 
      SELECT fs.ship_type_id, fs.quantity, st.name
      FROM fleet_ships fs
      JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = p_fleet_id
    LOOP
      v_ships_lost_count := floor(v_ship_type.quantity * v_loss_percent / 100);
      IF v_ships_lost_count > 0 THEN
        v_ships_lost := v_ships_lost || jsonb_build_object(
          'ship_type_id', v_ship_type.ship_type_id, 
          'name', v_ship_type.name, 
          'quantity', v_ships_lost_count
        );
      END IF;
    END LOOP;

    UPDATE fleet_ships 
    SET quantity = GREATEST(1, floor(quantity * (100 - v_loss_percent) / 100))
    WHERE fleet_id = p_fleet_id;

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 50 THEN
    -- NADA ENCONTRADO (16%)
    v_event_type := 'nothing';
    v_message_subject := 'Expedicion - Sin Hallazgos';
    v_message_body := 'Tu flota exploro vastas regiones del espacio profundo durante dias, ' ||
                      'pero desafortunadamente no encontraron nada de valor. ' ||
                      'El universo a veces es un lugar vacio y desolado.';

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  -- ==========================================
  -- EVENTOS POSITIVOS (50% total)
  -- ==========================================

  ELSIF v_event_roll < 60 THEN
    -- MATERIA OSCURA (10%) - Cantidades reducidas
    v_event_type := 'dark_matter';
    v_dark_matter_reward := 20 + floor(random() * 60)::integer + (v_astrophysics_level * 5);
    v_message_subject := 'Expedicion - Materia Oscura';
    v_message_body := 'Tu flota detecto una pequena concentracion de Materia Oscura flotando en el vacio. ' ||
                      'Lograron recolectar ' || v_dark_matter_reward::text || ' unidades.';

    UPDATE profiles 
    SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward 
    WHERE id = v_user_id;

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 72 THEN
    -- RECURSOS (12%) - Cantidades reducidas 40%
    v_event_type := 'resources';
    v_metal_found := (3000 + floor(random() * 12000) * (1 + v_astrophysics_level * 0.05));
    v_crystal_found := (1800 + floor(random() * 9000) * (1 + v_astrophysics_level * 0.05));
    v_deuterium_found := (600 + floor(random() * 6000) * (1 + v_astrophysics_level * 0.05));
    v_total_resources_found := v_metal_found + v_crystal_found + v_deuterium_found;

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
      v_message_body := 'Tu flota encontro recursos abandonados en una estacion derrelicta. ' ||
                        'Solo pudieron cargar lo que cabia: ' || 
                        floor(v_metal_reward)::text || ' Metal, ' || 
                        floor(v_crystal_reward)::text || ' Cristal, ' || 
                        floor(v_deuterium_reward)::text || ' Deuterio.';
    ELSE
      v_message_body := 'Tu flota descubrio recursos flotando en los restos de una batalla antigua: ' ||
                        floor(v_metal_reward)::text || ' Metal, ' || 
                        floor(v_crystal_reward)::text || ' Cristal, ' || 
                        floor(v_deuterium_reward)::text || ' Deuterio.';
    END IF;

    UPDATE fleets 
    SET 
      cargo_metal = cargo_metal + v_metal_reward,
      cargo_crystal = cargo_crystal + v_crystal_reward,
      cargo_deuterium = cargo_deuterium + v_deuterium_reward,
      is_returning = true
    WHERE id = p_fleet_id;

  ELSIF v_event_roll < 80 THEN
    -- NAVES ENCONTRADAS (8%) - Cantidad reducida
    v_event_type := 'ships';
    SELECT * INTO v_ship_type
    FROM ship_types
    WHERE code NOT IN ('deathstar', 'colony_ship', 'star_destroyer')
    AND base_speed > 0
    ORDER BY random()
    LIMIT 1;

    IF FOUND THEN
      v_ship_quantity := 1 + floor(random() * LEAST(3, 1 + v_astrophysics_level / 3))::integer;
      v_ships_found := jsonb_build_array(jsonb_build_object(
        'ship_type_id', v_ship_type.id, 
        'name', v_ship_type.name, 
        'quantity', v_ship_quantity
      ));

      INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
      VALUES (p_fleet_id, v_ship_type.id, v_ship_quantity)
      ON CONFLICT (fleet_id, ship_type_id)
      DO UPDATE SET quantity = fleet_ships.quantity + v_ship_quantity;

      v_message_subject := 'Expedicion - Naves Abandonadas';
      v_message_body := 'Tu flota encontro ' || v_ship_quantity::text || ' ' || v_ship_type.name || 
                        ' a la deriva con sistemas de soporte vital minimos. ' ||
                        'Fueron reactivadas y se unieron a tu flota.';
    ELSE
      v_message_subject := 'Expedicion - Sin Hallazgos';
      v_message_body := 'Tu flota exploro el espacio profundo pero no encontro nada de valor.';
    END IF;

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 88 THEN
    -- RECURSOS + MATERIA OSCURA (8%) - Reducido
    v_event_type := 'resources_and_dm';
    v_metal_found := (2000 + floor(random() * 6000));
    v_crystal_found := (1200 + floor(random() * 5000));
    v_total_resources_found := v_metal_found + v_crystal_found;
    v_dark_matter_reward := 15 + floor(random() * 45)::integer;

    IF v_total_resources_found > v_available_cargo AND v_total_resources_found > 0 THEN
      v_cargo_full := true;
      v_metal_reward := floor(v_available_cargo * (v_metal_found / v_total_resources_found));
      v_crystal_reward := floor(v_available_cargo * (v_crystal_found / v_total_resources_found));
    ELSE
      v_metal_reward := floor(v_metal_found);
      v_crystal_reward := floor(v_crystal_found);
    END IF;

    v_message_subject := 'Expedicion - Descubrimiento Mixto';
    v_message_body := 'Tu flota descubrio un pequeno deposito de recursos y Materia Oscura: ' ||
                      floor(v_metal_reward)::text || ' Metal, ' || 
                      floor(v_crystal_reward)::text || ' Cristal y ' || 
                      v_dark_matter_reward::text || ' Materia Oscura.';

    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward WHERE id = v_user_id;

    UPDATE fleets 
    SET 
      cargo_metal = cargo_metal + v_metal_reward,
      cargo_crystal = cargo_crystal + v_crystal_reward,
      is_returning = true
    WHERE id = p_fleet_id;

  ELSIF v_event_roll < 95 THEN
    -- ARTEFACTO ANTIGUO (7%)
    v_event_type := 'artifact';
    v_dark_matter_reward := 100 + floor(random() * 150)::integer + (v_astrophysics_level * 15);
    v_message_subject := 'Expedicion - Artefacto Antiguo';
    v_message_body := 'Tu flota descubrio los restos de una civilizacion antigua! ' ||
                      'Entre los escombros encontraron un artefacto que contenia ' || 
                      v_dark_matter_reward::text || ' unidades de Materia Oscura cristalizada.';

    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward WHERE id = v_user_id;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSE
    -- TESORO LEGENDARIO (5%) - Intento garantizado al pool de expediciones
    v_event_type := 'legendary_treasure';
    v_dark_matter_reward := 150 + floor(random() * 200)::integer + (v_astrophysics_level * 20);
    
    v_pool_result := attempt_expedition_pool_win(v_user_id, true);
    v_pool_won := COALESCE((v_pool_result->>'won')::boolean, false);
    v_pool_amount := COALESCE((v_pool_result->>'amount')::numeric, 0);
    
    v_message_subject := 'Expedicion - TESORO LEGENDARIO!';
    v_message_body := 'INCREIBLE! Tu flota descubrio las coordenadas de un tesoro legendario perdido hace eones! ' ||
                      'Encontraron ' || v_dark_matter_reward::text || ' Materia Oscura.';
    
    IF v_pool_won AND v_pool_amount > 0 THEN
      v_message_body := v_message_body || E'\n\n*** JACKPOT DEL POOL DE EXPEDICIONES! ***\n' ||
                        'El tesoro legendario contenia ' || floor(v_pool_amount)::text || ' FXU!';
    END IF;

    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward WHERE id = v_user_id;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;
  END IF;

  -- Intentar ganar del pool en eventos positivos (si no fue el tesoro legendario)
  IF NOT v_fleet_lost AND NOT v_partial_loss AND v_event_type != 'nothing' AND v_event_type != 'legendary_treasure' THEN
    v_pool_result := attempt_expedition_pool_win(v_user_id, false);
    v_pool_won := COALESCE((v_pool_result->>'won')::boolean, false);
    v_pool_amount := COALESCE((v_pool_result->>'amount')::numeric, 0);
    
    IF v_pool_won AND v_pool_amount > 0 THEN
      v_message_body := v_message_body || E'\n\n*** BONUS! Tu expedicion encontro parte del Pool de Expediciones! ***\n' ||
                        'Ganaste ' || floor(v_pool_amount)::text || ' FXU adicionales!';
    END IF;
  END IF;

  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (NULL, v_user_id, v_message_subject, v_message_body, 'expedition');

  RETURN jsonb_build_object(
    'success', true,
    'event_type', v_event_type,
    'metal', v_metal_reward,
    'crystal', v_crystal_reward,
    'deuterium', v_deuterium_reward,
    'dark_matter', v_dark_matter_reward,
    'ships_found', v_ships_found,
    'ships_lost', v_ships_lost,
    'fleet_lost', v_fleet_lost,
    'partial_loss', v_partial_loss,
    'loss_percent', v_loss_percent,
    'pool_won', v_pool_won,
    'pool_amount', v_pool_amount,
    'cargo_was_full', v_cargo_full
  );
END;
$$;

GRANT EXECUTE ON FUNCTION attempt_expedition_pool_win(uuid, boolean) TO authenticated;
