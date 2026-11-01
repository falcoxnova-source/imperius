-- ============================================================================
-- Anuncio en Telegram al repartir las recompensas de Fortaleza y Planeta del
-- Tesoro.
--
-- Que hace:
--   * Acumula, dentro del bucle de alianzas ya existente, una linea por alianza
--     recompensada (tag, cuantas fortalezas/planetas controla, cuantos miembros
--     y cuantos TUNG recibio CADA miembro).
--   * Al final del reparto envia UN solo comunicado al microservicio interno
--     http://172.18.0.1:9002/internal-telegram-broadcast, que reenvia a todos
--     los canales de `telegram_groups` habilitados (mismo patron ya probado y en
--     produccion en admin_distribute_destruction_pool).
--
-- Garantias de no-regresion:
--   * El bloque de Telegram esta al FINAL, despues de acreditar saldos, insertar
--     recompensas, mensajes in-game y descontar el pool.
--   * Va envuelto en BEGIN/EXCEPTION WHEN OTHERS -> si Telegram o la red fallan,
--     el reparto YA esta hecho y la funcion devuelve success igual.
--   * Cero cambios en la logica de calculo, montos, guardas o valores de retorno.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) FORTALEZA
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_distribute_fortress_pool()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pool_balance numeric;
  v_alliance_ids uuid[];
  v_ally_id uuid;
  v_ally_tag text;
  v_num_alliances int;
  v_amount_per_alliance numeric;
  v_total_fortresses int;
  v_amount_per_fortress numeric;
  v_ally_fortresses int;
  v_amount_this_alliance numeric;
  v_member_ids uuid[];
  v_num_members int;
  v_amount_per_member numeric;
  v_total_distributed numeric := 0;
  v_total_recipients int := 0;
  v_distribution_id uuid;
  v_member_id uuid;
  v_is_admin boolean;
  v_existing_date date;
  -- Telegram (nuevo)
  v_tg_lines text := '';
  v_tg_body text;
  v_internal_token text;
  v_request_id bigint;
BEGIN
  -- Admin check: allow Supabase admin users AND direct DB connections  
  BEGIN
    -- Try to get the authenticated user
    IF auth.uid() IS NULL THEN
      -- No auth context = direct DB connection (allow)
      v_is_admin := true;
    ELSE
      -- Check if this user is an admin
      SELECT is_admin INTO STRICT v_is_admin FROM profiles WHERE id = auth.uid();
    END IF;
  EXCEPTION 
    WHEN NO_DATA_FOUND THEN v_is_admin := false;
    WHEN OTHERS THEN v_is_admin := true; -- direct DB connection fallback
  END;
  
  IF v_is_admin IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores pueden ejecutar esta accion');
  END IF;

  -- Guard: one distribution per day
  SELECT distribution_date INTO v_existing_date
  FROM fortress_pool_distributions
  WHERE distribution_date = CURRENT_DATE;
  
  IF v_existing_date IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya se distribuyo el pool de fortaleza hoy (' || CURRENT_DATE || ')');
  END IF;

  -- Read pool balance
  SELECT plus_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;
  
  IF v_pool_balance IS NULL OR v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay balance en el pool de fortaleza (plus_balance = ' || COALESCE(v_pool_balance, 0) || ')');
  END IF;

  -- Get alliances that own at least one fortress
  SELECT array_agg(DISTINCT owner_alliance_id ORDER BY owner_alliance_id)
  INTO v_alliance_ids
  FROM alliance_fortresses
  WHERE owner_alliance_id IS NOT NULL;

  IF v_alliance_ids IS NULL OR array_length(v_alliance_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay alianzas con fortalezas capturadas');
  END IF;

  v_num_alliances := array_length(v_alliance_ids, 1);
  v_total_fortresses := (SELECT COUNT(*) FROM alliance_fortresses WHERE owner_alliance_id IS NOT NULL);
  IF v_total_fortresses IS NULL OR v_total_fortresses = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay fortalezas capturadas');
  END IF;
  v_amount_per_fortress := FLOOR(v_pool_balance / v_total_fortresses);
  v_amount_per_alliance := v_amount_per_fortress;

  -- Bypass the fxu_balance protection trigger for distribution
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Create distribution record
  INSERT INTO fortress_pool_distributions (
    distribution_date, total_pool_amount, total_alliances, distributed_by
  ) VALUES (
    CURRENT_DATE, v_pool_balance, v_num_alliances, COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  )
  RETURNING id INTO v_distribution_id;

  -- Distribute to each alliance
  FOREACH v_ally_id IN ARRAY v_alliance_ids
  LOOP
    -- Get alliance tag
    SELECT tag INTO v_ally_tag FROM alliances WHERE id = v_ally_id;

    -- Get alliance members
    SELECT array_agg(user_id ORDER BY user_id)
    INTO v_member_ids
    FROM alliance_members
    WHERE alliance_id = v_ally_id;

    IF v_member_ids IS NULL OR array_length(v_member_ids, 1) = 0 THEN
      CONTINUE; -- skip empty alliances
    END IF;

    v_num_members := array_length(v_member_ids, 1);
    v_ally_fortresses := (SELECT COUNT(*) FROM alliance_fortresses WHERE owner_alliance_id = v_ally_id);
    v_amount_this_alliance := v_amount_per_fortress * COALESCE(v_ally_fortresses, 0);
    v_amount_per_member := FLOOR(v_amount_this_alliance / v_num_members);

    -- Linea del comunicado de Telegram para esta alianza (solo acumula texto)
    IF v_amount_per_member > 0 THEN
      v_tg_lines := v_tg_lines
        || '[' || COALESCE(v_ally_tag, 'Desconocida') || '] - '
        || v_ally_fortresses || CASE WHEN v_ally_fortresses = 1 THEN ' fortaleza' ELSE ' fortalezas' END
        || ' - ' || v_num_members || CASE WHEN v_num_members = 1 THEN ' miembro' ELSE ' miembros' END
        || chr(10)
        || '   ' || v_amount_per_member || ' TUNG para cada miembro'
        || chr(10) || chr(10);
    END IF;

    -- Credit each member
    FOREACH v_member_id IN ARRAY v_member_ids
    LOOP
      -- Add FXU to wallet
      UPDATE profiles 
      SET fxu_balance = fxu_balance + v_amount_per_member
      WHERE id = v_member_id;

      -- Record reward
      INSERT INTO fortress_pool_rewards (
        distribution_id, user_id, alliance_id, alliance_tag, reward_amount
      ) VALUES (
        v_distribution_id, v_member_id, v_ally_id, v_ally_tag, v_amount_per_member
      );

      -- Notify player (numero real de fortalezas, singular/plural correcto)
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type, created_at)
      VALUES (
        v_member_id, NULL,
        'Recompensa de Fortaleza',
        '🏰 ¡Tu alianza ' || COALESCE(v_ally_tag, 'Desconocida') || ' controla ' ||
        v_ally_fortresses || CASE WHEN v_ally_fortresses = 1 THEN ' fortaleza!' ELSE ' fortalezas!' END || E'\n\n' ||
        'Has recibido ' || v_amount_per_member || ' TUNG como recompensa diaria.' || E'\n\n' ||
        'Mantengan el control de ' || CASE WHEN v_ally_fortresses = 1 THEN 'la fortaleza' ELSE 'las fortalezas' END || ' para seguir recibiendo recompensas.',
        'system', now()
      );

      v_total_distributed := v_total_distributed + v_amount_per_member;
      v_total_recipients := v_total_recipients + 1;
    END LOOP;
  END LOOP;

  -- Update distribution record with final counts
  UPDATE fortress_pool_distributions
  SET total_recipients = v_total_recipients,
      total_distributed = v_total_distributed
  WHERE id = v_distribution_id;

  -- Deduct from pool (only what was actually distributed, remainder stays)
  UPDATE jackpot_pools
  SET plus_balance = plus_balance - v_total_distributed,
      updated_at = now()
  WHERE id = 1;

  -- === Comunicado en Telegram (best-effort; el reparto ya esta cerrado) ===
  BEGIN
    IF v_tg_lines <> '' THEN
      v_tg_body :=
           '🏰 Las alianzas que controlan fortalezas ya cobraron su recompensa diaria.' || chr(10) || chr(10)
        || '💰 Total repartido: ' || v_total_distributed || ' TUNG' || chr(10)
        || '👥 Jugadores recompensados: ' || v_total_recipients || chr(10) || chr(10)
        || v_tg_lines
        || '¡Conquista una fortaleza con tu alianza y cobra TUNG cada dia!' || chr(10)
        || 'Unete: https://t.me/TrungTungMeme';

      SELECT internal_broadcast_token INTO v_internal_token
      FROM market_notification_config WHERE id = 1;

      IF v_internal_token IS NOT NULL AND v_internal_token <> '' THEN
        SELECT net.http_post(
          url := 'http://172.18.0.1:9002/internal-telegram-broadcast',
          body := jsonb_build_object(
            'token', v_internal_token,
            'subject', 'Reparto diario de Fortalezas',
            'body', v_tg_body
          ),
          headers := jsonb_build_object('Content-Type', 'application/json')
        ) INTO v_request_id;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Telegram broadcast (fortaleza) fallo: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'distribution_date', CURRENT_DATE,
    'pool_balance_before', v_pool_balance,
    'total_distributed', v_total_distributed,
    'remainder', v_pool_balance - v_total_distributed,
    'total_alliances', v_num_alliances,
    'total_recipients', v_total_recipients,
    'total_fortresses', v_total_fortresses,
    'amount_per_fortress', v_amount_per_fortress
  );
END;
$function$;


-- ----------------------------------------------------------------------------
-- 2) PLANETA DEL TESORO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_distribute_treasure_pool()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pool_balance numeric;
  v_alliance_ids uuid[];
  v_ally_id uuid;
  v_ally_tag text;
  v_num_alliances int;
  v_amount_per_alliance numeric;
  v_total_planets int;
  v_amount_per_planet numeric;
  v_ally_planets int;
  v_amount_this_alliance numeric;
  v_member_ids uuid[];
  v_num_members int;
  v_amount_per_member numeric;
  v_total_distributed numeric := 0;
  v_total_recipients int := 0;
  v_distribution_id uuid;
  v_member_id uuid;
  v_is_admin boolean;
  v_existing_date date;
  -- Telegram (nuevo)
  v_tg_lines text := '';
  v_tg_body text;
  v_internal_token text;
  v_request_id bigint;
BEGIN
  BEGIN
    IF auth.uid() IS NULL THEN
      v_is_admin := true;
    ELSE
      SELECT is_admin INTO STRICT v_is_admin FROM profiles WHERE id = auth.uid();
    END IF;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN v_is_admin := false;
    WHEN OTHERS THEN v_is_admin := true;
  END;

  IF v_is_admin IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores pueden ejecutar esta accion');
  END IF;

  SELECT distribution_date INTO v_existing_date
  FROM treasure_pool_distributions
  WHERE distribution_date = CURRENT_DATE;

  IF v_existing_date IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya se distribuyo el pool del Planeta del Tesoro hoy (' || CURRENT_DATE || ')');
  END IF;

  SELECT destruction_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;

  IF v_pool_balance IS NULL OR v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay balance en el pool del Planeta del Tesoro (destruction_balance = ' || COALESCE(v_pool_balance, 0) || ')');
  END IF;

  SELECT array_agg(DISTINCT owner_alliance_id ORDER BY owner_alliance_id)
  INTO v_alliance_ids
  FROM treasure_planets
  WHERE owner_alliance_id IS NOT NULL;

  IF v_alliance_ids IS NULL OR array_length(v_alliance_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay alianzas con Planetas del Tesoro capturados');
  END IF;

  v_num_alliances := array_length(v_alliance_ids, 1);
  v_total_planets := (SELECT COUNT(*) FROM treasure_planets WHERE owner_alliance_id IS NOT NULL);
  IF v_total_planets IS NULL OR v_total_planets = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay Planetas del Tesoro capturados');
  END IF;
  v_amount_per_planet := FLOOR(v_pool_balance / v_total_planets);
  v_amount_per_alliance := v_amount_per_planet;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  INSERT INTO treasure_pool_distributions (
    distribution_date, total_pool_amount, total_alliances, distributed_by
  ) VALUES (
    CURRENT_DATE, v_pool_balance, v_num_alliances, COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  )
  RETURNING id INTO v_distribution_id;

  FOREACH v_ally_id IN ARRAY v_alliance_ids
  LOOP
    SELECT tag INTO v_ally_tag FROM alliances WHERE id = v_ally_id;

    SELECT array_agg(user_id ORDER BY user_id)
    INTO v_member_ids
    FROM alliance_members
    WHERE alliance_id = v_ally_id;

    IF v_member_ids IS NULL OR array_length(v_member_ids, 1) = 0 THEN
      CONTINUE;
    END IF;

    v_num_members := array_length(v_member_ids, 1);
    v_ally_planets := (SELECT COUNT(*) FROM treasure_planets WHERE owner_alliance_id = v_ally_id);
    v_amount_this_alliance := v_amount_per_planet * COALESCE(v_ally_planets, 0);
    v_amount_per_member := FLOOR(v_amount_this_alliance / v_num_members);

    -- Linea del comunicado de Telegram para esta alianza (solo acumula texto)
    IF v_amount_per_member > 0 THEN
      v_tg_lines := v_tg_lines
        || '[' || COALESCE(v_ally_tag, 'Desconocida') || '] - '
        || v_ally_planets || CASE WHEN v_ally_planets = 1 THEN ' Planeta del Tesoro' ELSE ' Planetas del Tesoro' END
        || ' - ' || v_num_members || CASE WHEN v_num_members = 1 THEN ' miembro' ELSE ' miembros' END
        || chr(10)
        || '   ' || v_amount_per_member || ' TUNG para cada miembro'
        || chr(10) || chr(10);
    END IF;

    FOREACH v_member_id IN ARRAY v_member_ids
    LOOP
      UPDATE profiles
      SET fxu_balance = fxu_balance + v_amount_per_member
      WHERE id = v_member_id;

      INSERT INTO treasure_pool_rewards (
        distribution_id, user_id, alliance_id, alliance_tag, reward_amount
      ) VALUES (
        v_distribution_id, v_member_id, v_ally_id, v_ally_tag, v_amount_per_member
      );

      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type, created_at)
      VALUES (
        v_member_id, NULL,
        'Recompensa del Planeta del Tesoro',
        '💎 ¡Tu alianza ' || COALESCE(v_ally_tag, 'Desconocida') || ' controla ' ||
        v_ally_planets || CASE WHEN v_ally_planets = 1 THEN ' Planeta del Tesoro!' ELSE ' Planetas del Tesoro!' END || E'\n\n' ||
        'Has recibido ' || v_amount_per_member || ' TUNG como recompensa diaria.' || E'\n\n' ||
        'Mantengan el control de ' || CASE WHEN v_ally_planets = 1 THEN 'el planeta' ELSE 'los planetas' END || ' para seguir recibiendo recompensas.',
        'system', now()
      );

      v_total_distributed := v_total_distributed + v_amount_per_member;
      v_total_recipients := v_total_recipients + 1;
    END LOOP;
  END LOOP;

  UPDATE treasure_pool_distributions
  SET total_recipients = v_total_recipients,
      total_distributed = v_total_distributed
  WHERE id = v_distribution_id;

  UPDATE jackpot_pools
  SET destruction_balance = destruction_balance - v_total_distributed,
      updated_at = now()
  WHERE id = 1;

  -- === Comunicado en Telegram (best-effort; el reparto ya esta cerrado) ===
  BEGIN
    IF v_tg_lines <> '' THEN
      v_tg_body :=
           '💎 La alianza que controla el Planeta del Tesoro ya cobro su recompensa diaria.' || chr(10) || chr(10)
        || '💰 Total repartido: ' || v_total_distributed || ' TUNG' || chr(10)
        || '👥 Jugadores recompensados: ' || v_total_recipients || chr(10) || chr(10)
        || v_tg_lines
        || '¡Conquista el Planeta del Tesoro con tu alianza y cobra TUNG cada dia!' || chr(10)
        || 'Unete: https://t.me/TrungTungMeme';

      SELECT internal_broadcast_token INTO v_internal_token
      FROM market_notification_config WHERE id = 1;

      IF v_internal_token IS NOT NULL AND v_internal_token <> '' THEN
        SELECT net.http_post(
          url := 'http://172.18.0.1:9002/internal-telegram-broadcast',
          body := jsonb_build_object(
            'token', v_internal_token,
            'subject', 'Reparto diario del Planeta del Tesoro',
            'body', v_tg_body
          ),
          headers := jsonb_build_object('Content-Type', 'application/json')
        ) INTO v_request_id;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Telegram broadcast (planeta del tesoro) fallo: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'distribution_date', CURRENT_DATE,
    'pool_balance_before', v_pool_balance,
    'total_distributed', v_total_distributed,
    'remainder', v_pool_balance - v_total_distributed,
    'total_alliances', v_num_alliances,
    'total_recipients', v_total_recipients,
    'total_planets', v_total_planets,
    'amount_per_planet', v_amount_per_planet
  );
END;
$function$;
