-- ============================================================================
-- Equivalente en USDT junto a las cantidades de TUNG en los comunicados de
-- Telegram del reparto diario de Fortalezas y del Planeta del Tesoro.
--
-- Que cambia (SOLO el texto que se envia a los canales de Telegram):
--   * "Total repartido: N TUNG"           -> "... N TUNG (~ $X USDT)"
--   * "   N TUNG para cada miembro"       -> "... (~ $X USDT)"
--
-- Fuente del precio: get_live_tung_price_usd() (game_settings.tung_price_usd,
-- actualizado por la edge function token-price desde DexScreener). Si el precio
-- no esta fresco (> 60 min) la funcion devuelve NULL y NO se anade nada al
-- texto: el mensaje queda exactamente como antes.
--
-- Garantias de no-regresion:
--   * Cero cambios en calculo de montos, guardas, saldos, tablas o valores de
--     retorno.
--   * Los mensajes in-game NO se tocan.
--   * La lectura del precio va en BEGIN/EXCEPTION -> si fallara, v_tung_price
--     queda NULL y el reparto sigue igual.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Helper de formato: devuelve ' (~ $X USDT)' o '' si no hay precio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.format_usd_suffix(p_tung numeric, p_price numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fmt$
DECLARE
  v_usd numeric;
BEGIN
  IF p_tung IS NULL OR p_price IS NULL OR p_price <= 0 OR p_tung <= 0 THEN
    RETURN '';
  END IF;

  v_usd := p_tung * p_price;

  IF v_usd >= 1 THEN
    RETURN ' (~ $' || to_char(v_usd, 'FM999999999990.00') || ' USDT)';
  ELSIF v_usd >= 0.01 THEN
    RETURN ' (~ $' || to_char(v_usd, 'FM990.0000') || ' USDT)';
  ELSE
    RETURN ' (~ $' || to_char(v_usd, 'FM990.000000') || ' USDT)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN '';
END;
$fmt$;

GRANT EXECUTE ON FUNCTION public.format_usd_suffix(numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.format_usd_suffix(numeric, numeric) TO service_role;

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
  v_tung_price numeric;
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

  -- Precio TUNG en vivo, solo para mostrar el equivalente en USDT en el
  -- comunicado de Telegram. Si no hay precio fresco queda NULL y no se
  -- muestra nada extra (cero impacto en el reparto).
  BEGIN
    v_tung_price := public.get_live_tung_price_usd();
  EXCEPTION WHEN OTHERS THEN
    v_tung_price := NULL;
  END;

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
        || public.format_usd_suffix(v_amount_per_member, v_tung_price)
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
        || '💰 Total repartido: ' || v_total_distributed || ' TUNG'
        || public.format_usd_suffix(v_total_distributed, v_tung_price) || chr(10)
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
  v_tung_price numeric;
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

  -- Precio TUNG en vivo, solo para mostrar el equivalente en USDT en el
  -- comunicado de Telegram. Si no hay precio fresco queda NULL y no se
  -- muestra nada extra (cero impacto en el reparto).
  BEGIN
    v_tung_price := public.get_live_tung_price_usd();
  EXCEPTION WHEN OTHERS THEN
    v_tung_price := NULL;
  END;

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
        || public.format_usd_suffix(v_amount_per_member, v_tung_price)
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
        || '💰 Total repartido: ' || v_total_distributed || ' TUNG'
        || public.format_usd_suffix(v_total_distributed, v_tung_price) || chr(10)
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
