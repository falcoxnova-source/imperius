/*
  # Rebalanceo de Expediciones: 70% Positivo / 30% Negativo + Hallazgo de Tokens

  ## Resumen General
  Se rebalancean las probabilidades de expedicion para que sean mucho mas generosas.
  Antes era 50/50, ahora es 70% positivo y 30% negativo/neutral.
  Se agrega un nuevo evento "Hallazgo de Tokens" que da FXU directo al jugador.

  ## Tabla de Probabilidades Nueva
  | Evento                  | % Anterior | % Nuevo | Tipo     |
  |------------------------|-----------|---------|----------|
  | Agujero negro           | 6%        | 2%      | NEGATIVO |
  | Piratas                 | 12%       | 5%      | NEGATIVO |
  | Anomalia gravitatoria   | 8%        | 3%      | NEGATIVO |
  | Tormenta ionica         | 8%        | 3%      | NEGATIVO |
  | Nada encontrado         | 16%       | 17%     | NEUTRAL  |
  | Materia oscura          | 10%       | 12%     | POSITIVO |
  | Recursos                | 12%       | 16%     | POSITIVO |
  | Naves encontradas       | 8%        | 10%     | POSITIVO |
  | Recursos + Materia osc. | 8%        | 10%     | POSITIVO |
  | Artefacto antiguo       | 7%        | 8%      | POSITIVO |
  | Tesoro legendario       | 5%        | 6%      | POSITIVO |
  | Hallazgo de Tokens      | 0%        | 8%      | POSITIVO (NUEVO) |

  ## Nuevo Evento: Hallazgo de Tokens
  - Recompensa: 5-25 FXU base + (nivel_astrofisica * 2) FXU bonus
  - Se acredita directamente al fxu_balance del jugador
  - Genera revenue tracking como tipo 'expedition_token_find'

  ## Mejoras al Pool de Expediciones
  - Probabilidad de ganar pool sube de 5% a 15%
  - Porcentaje del pool que se gana sube de 1% a 3%

  ## Funciones Modificadas
  - `process_expedition` - Nuevas probabilidades y evento de tokens
  - `attempt_expedition_pool_win` - Mayor probabilidad y porcentaje de premio
*/

-- 1. Actualizar attempt_expedition_pool_win con mejores probabilidades
CREATE OR REPLACE FUNCTION attempt_expedition_pool_win(p_user_id uuid, p_guaranteed boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_balance numeric;
  v_roll numeric;
  v_win_chance numeric := 15;
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
    
    v_win_percent := 3;
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

-- 2. Actualizar process_expedition con nuevas probabilidades 70/30 y evento tokens
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
  v_fxu_reward numeric := 0;
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
  v_probe_type_id integer;
  v_only_probes boolean := false;
  v_total_ships integer := 0;
  v_probe_count integer := 0;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Flota no encontrada');
  END IF;

  v_user_id := v_fleet.user_id;

  SELECT id INTO v_probe_type_id FROM ship_types WHERE code = 'espionage_probe';

  SELECT 
    COALESCE(SUM(fs.quantity), 0),
    COALESCE(SUM(CASE WHEN fs.ship_type_id = v_probe_type_id THEN fs.quantity ELSE 0 END), 0)
  INTO v_total_ships, v_probe_count
  FROM fleet_ships fs
  WHERE fs.fleet_id = p_fleet_id;

  IF v_total_ships > 0 AND v_probe_count = v_total_ships THEN
    v_only_probes := true;
  END IF;

  IF v_only_probes THEN
    v_event_type := 'probes_nothing';
    v_message_subject := 'Expedicion - Sondas Sin Hallazgos';
    v_message_body := 'Tus Sondas de Espionaje exploraron la region pero no estan equipadas para ' ||
                      'recolectar recursos ni detectar tesoros. Las sondas estan disenadas para ' ||
                      'espionaje, no para expediciones de exploracion. ' ||
                      'Considera enviar naves de combate o transporte en futuras expediciones.';

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (NULL, v_user_id, v_message_subject, v_message_body, 'expedition');

    RETURN jsonb_build_object(
      'success', true,
      'event_type', v_event_type,
      'metal', 0,
      'crystal', 0,
      'deuterium', 0,
      'dark_matter', 0,
      'fxu_reward', 0,
      'ships_found', '[]'::jsonb,
      'ships_lost', '[]'::jsonb,
      'fleet_lost', false,
      'partial_loss', false,
      'loss_percent', 0,
      'pool_won', false,
      'pool_amount', 0,
      'cargo_was_full', false,
      'only_probes', true
    );
  END IF;

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

  -- ====== EVENTOS NEGATIVOS: 13% total ======

  IF v_event_roll < 2 THEN
    -- AGUJERO NEGRO (2%) - Pierde toda la flota
    v_fleet_lost := true;
    v_event_type := 'black_hole';
    v_message_subject := 'Expedicion PERDIDA - Agujero Negro';
    v_message_body := 'DESASTRE! Tu flota de expedicion fue tragada por un agujero negro masivo. ' ||
                      'Las comunicaciones se cortaron abruptamente y no hubo senales de vida. ' ||
                      'Todas las naves y tripulacion se perdieron para siempre.';

    v_ships_lost := v_ships_before;
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 7 THEN
    -- PIRATAS (5%) - Pierde 40-70% naves
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

  ELSIF v_event_roll < 10 THEN
    -- ANOMALIA GRAVITATORIA (3%) - Pierde 20-50% naves
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

  ELSIF v_event_roll < 13 THEN
    -- TORMENTA IONICA (3%) - Pierde 20-40% naves
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

  -- ====== EVENTO NEUTRAL: 17% ======

  ELSIF v_event_roll < 30 THEN
    -- NADA (17%) - Sin perdidas ni ganancias
    v_event_type := 'nothing';
    v_message_subject := 'Expedicion - Sin Hallazgos';
    v_message_body := 'Tu flota exploro vastas regiones del espacio profundo durante dias, ' ||
                      'pero desafortunadamente no encontraron nada de valor. ' ||
                      'El universo a veces es un lugar vacio y desolado.';

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  -- ====== EVENTOS POSITIVOS: 70% total ======

  ELSIF v_event_roll < 42 THEN
    -- MATERIA OSCURA (12%)
    v_event_type := 'dark_matter';
    v_dark_matter_reward := 20 + floor(random() * 60)::integer + (v_astrophysics_level * 5);
    v_message_subject := 'Expedicion - Materia Oscura';
    v_message_body := 'Tu flota detecto una pequena concentracion de Materia Oscura flotando en el vacio. ' ||
                      'Lograron recolectar ' || v_dark_matter_reward::text || ' unidades.';

    UPDATE profiles 
    SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward 
    WHERE id = v_user_id;

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 58 THEN
    -- RECURSOS (16%)
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

  ELSIF v_event_roll < 68 THEN
    -- NAVES ENCONTRADAS (10%)
    v_event_type := 'ships';
    SELECT * INTO v_ship_type
    FROM ship_types
    WHERE code NOT IN ('deathstar', 'colony_ship', 'star_destroyer', 'black_moon', 'espionage_probe')
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

  ELSIF v_event_roll < 78 THEN
    -- RECURSOS + MATERIA OSCURA (10%)
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

  ELSIF v_event_roll < 86 THEN
    -- ARTEFACTO ANTIGUO (8%)
    v_event_type := 'artifact';
    v_dark_matter_reward := 100 + floor(random() * 150)::integer + (v_astrophysics_level * 15);
    v_message_subject := 'Expedicion - Artefacto Antiguo';
    v_message_body := 'Tu flota descubrio los restos de una civilizacion antigua! ' ||
                      'Entre los escombros encontraron un artefacto que contenia ' || 
                      v_dark_matter_reward::text || ' unidades de Materia Oscura cristalizada.';

    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_dark_matter_reward WHERE id = v_user_id;
    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSIF v_event_roll < 94 THEN
    -- HALLAZGO DE TOKENS (8%) - NUEVO EVENTO
    v_event_type := 'token_discovery';
    v_fxu_reward := 5 + floor(random() * 21) + (v_astrophysics_level * 2);
    
    v_message_subject := 'Expedicion - Hallazgo de Tokens FXU!';
    v_message_body := 'Tu flota descubrio una capsula de almacenamiento digital a la deriva en el espacio! ' ||
                      'Al descifrar su contenido, encontraron ' || floor(v_fxu_reward)::text || ' Tokens FXU ' ||
                      'almacenados en un monedero cuantico antiguo. ' ||
                      'Los tokens han sido transferidos a tu cuenta.';

    PERFORM _internal_set_fxu_context();
    
    UPDATE profiles 
    SET fxu_balance = fxu_balance + v_fxu_reward 
    WHERE id = v_user_id;

    INSERT INTO admin_revenue (revenue_type, amount, description, user_id)
    VALUES ('expedition_token_find', v_fxu_reward, 'Hallazgo de tokens en expedicion', v_user_id);

    UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;

  ELSE
    -- TESORO LEGENDARIO (6%)
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

  IF NOT v_fleet_lost AND NOT v_partial_loss AND v_event_type NOT IN ('nothing', 'legendary_treasure', 'token_discovery') THEN
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
    'fxu_reward', v_fxu_reward,
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
