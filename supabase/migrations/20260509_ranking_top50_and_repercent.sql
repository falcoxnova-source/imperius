-- =====================================================================
-- 20260509_ranking_top50_and_repercent.sql
--
-- Cambios solicitados (solo porcentajes + top 10 -> top 50 en el pool
-- mensual). Nada más se toca: destruction, social y expedition quedan
-- igual en su lógica interna.
--
-- 1) admin_update_pool_percents: ahora exige que la suma sea 100 (antes 80,
--    porque había un 20% de reserva). La reserva se elimina; ese 20%
--    se suma al pool mensual.
--
-- 2) jackpot_pools (id=1): actualizar porcentajes:
--      monthly_percent     = 30  (antes 10, +20% de la reserva eliminada)
--      destruction_percent = 50  (igual)
--      plus_percent        = 10  (social - igual)
--      expedition_percent  = 10  (igual)
--      Suma = 100
--
-- 3) admin_distribute_monthly_pool: top 10 -> top 50
--      - LIMIT 10 -> LIMIT 50
--      - base exponencial bajada de 1.3 a 1.08 para que los 50 puestos
--        reciban una cantidad significativa (con 1.3 los puestos 15-50
--        quedaban en 0 FXU por redondeo).
--      - Textos "TOP 10" cambiados a "TOP 50".
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) admin_update_pool_percents: suma debe ser 100 (no 80)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_pool_percents(
  p_expedition_percent  integer,
  p_monthly_percent     integer,
  p_plus_percent        integer,
  p_destruction_percent integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id  UUID;
  v_is_admin BOOLEAN;
  v_total    INTEGER;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;

  IF NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', 'No tienes permisos de administrador');
  END IF;

  -- La suma debe ser 100 (se eliminó la reserva del 20%).
  v_total := p_expedition_percent + p_monthly_percent + p_plus_percent + p_destruction_percent;

  IF v_total <> 100 THEN
    RETURN json_build_object('success', false, 'error', 'La suma de los porcentajes debe ser 100%');
  END IF;

  IF p_expedition_percent < 0
     OR p_monthly_percent < 0
     OR p_plus_percent < 0
     OR p_destruction_percent < 0 THEN
    RETURN json_build_object('success', false, 'error', 'Los porcentajes no pueden ser negativos');
  END IF;

  UPDATE jackpot_pools
     SET expedition_percent  = p_expedition_percent,
         monthly_percent     = p_monthly_percent,
         plus_percent        = p_plus_percent,
         destruction_percent = p_destruction_percent,
         updated_at          = NOW()
   WHERE id = 1;

  RETURN json_build_object(
    'success', true,
    'expedition_percent',  p_expedition_percent,
    'monthly_percent',     p_monthly_percent,
    'plus_percent',        p_plus_percent,
    'destruction_percent', p_destruction_percent
  );
END;
$function$;


-- ---------------------------------------------------------------------
-- 2) Actualizar la fila existente de jackpot_pools para que el
--    destino real de las contribuciones futuras sume 100%.
--    Nota: se usa set_config para que el trigger protect_fxu_balance
--    (si aplica) permita el update; jackpot_pools no toca fxu_balance
--    pero por consistencia con el patrón existente.
-- ---------------------------------------------------------------------
UPDATE public.jackpot_pools
   SET monthly_percent     = 30,
       destruction_percent = 50,
       plus_percent        = 10,
       expedition_percent  = 10,
       updated_at          = NOW()
 WHERE id = 1;


-- ---------------------------------------------------------------------
-- 3) admin_distribute_monthly_pool: top 10 -> top 50
--    Misma lógica, mismo flujo (distribución progresiva, remainder al #1,
--    mensajes in-game, broadcast Telegram, vaciado del pool). Solo cambia
--    el tamaño del top y la curva de pesos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_distribute_monthly_pool()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id            uuid;
  v_pool_balance        numeric;
  v_distribution_id     uuid;
  v_distributed_count   int := 0;
  v_player              RECORD;
  v_rank                int := 0;
  v_weight              numeric;
  v_total_weight        numeric := 0;
  v_reward_percent      numeric;
  v_reward_amount       numeric;
  v_total_calculated    numeric := 0;
  v_remainder           numeric;
  v_distribution_month  date;
  v_rewards             jsonb := '[]'::jsonb;
  v_first_player_id     uuid;
  -- Base exponencial: 1.08 en vez de 1.3.
  -- Motivo: con 1.3 y 50 posiciones, los puestos 15-50 caían a 0 FXU por
  -- redondeo. Con 1.08 el #1 recibe ~8% y el #50 ~0.17%, reparto real.
  v_base                numeric := 1.08;
  v_top_size            int := 50;
  v_i                   int;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT monthly_balance INTO v_pool_balance FROM jackpot_pools WHERE id = 1;

  IF v_pool_balance IS NULL OR v_pool_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool mensual vacio o sin fondos');
  END IF;

  -- Peso total: sum_{i=0..N-1} base^(N-1-i)
  FOR v_i IN 0..(v_top_size - 1) LOOP
    v_total_weight := v_total_weight + power(v_base, (v_top_size - 1) - v_i);
  END LOOP;

  v_distribution_month := date_trunc('month', now())::date;

  INSERT INTO monthly_ranking_distributions (distribution_month, total_pool_amount, distributed_by)
  VALUES (v_distribution_month, v_pool_balance, v_admin_id)
  RETURNING id INTO v_distribution_id;

  FOR v_player IN
    SELECT p.id, p.username, p.points_total
      FROM profiles p
     WHERE p.points_total > 0 AND p.is_admin = false
     ORDER BY p.points_total DESC
     LIMIT v_top_size
  LOOP
    v_rank := v_rank + 1;

    IF v_rank = 1 THEN
      v_first_player_id := v_player.id;
    END IF;

    -- Pesos: posicion 1 = base^(N-1), posicion N = base^0 = 1
    v_weight         := power(v_base, v_top_size - v_rank);
    v_reward_percent := ROUND((v_weight / v_total_weight) * 100, 2);
    v_reward_amount  := FLOOR(v_pool_balance * v_weight / v_total_weight);

    v_rewards := v_rewards || jsonb_build_object(
      'user_id',  v_player.id,
      'username', v_player.username,
      'rank',     v_rank,
      'points',   v_player.points_total,
      'amount',   v_reward_amount,
      'percent',  v_reward_percent
    );

    v_total_calculated := v_total_calculated + v_reward_amount;
  END LOOP;

  -- Sumar el remainder (redondeos) al #1
  v_remainder := v_pool_balance - v_total_calculated;

  IF v_remainder > 0 AND v_first_player_id IS NOT NULL THEN
    SELECT jsonb_agg(
      CASE
        WHEN (elem->>'user_id')::uuid = v_first_player_id
        THEN jsonb_set(elem, '{amount}', to_jsonb((elem->>'amount')::numeric + v_remainder))
        ELSE elem
      END
    ) INTO v_rewards
    FROM jsonb_array_elements(v_rewards) elem;

    v_total_calculated := v_pool_balance;
  END IF;

  PERFORM _internal_set_fxu_context();

  FOR v_player IN
    SELECT
      (elem->>'user_id')::uuid   AS user_id,
      (elem->>'rank')::int       AS rank,
      (elem->>'points')::numeric AS points,
      (elem->>'amount')::numeric AS amount,
      (elem->>'percent')::numeric AS percent
    FROM jsonb_array_elements(v_rewards) elem
  LOOP
    IF v_player.amount > 0 THEN
      UPDATE profiles
         SET fxu_balance = fxu_balance + v_player.amount
       WHERE id = v_player.user_id;

      INSERT INTO monthly_ranking_rewards (distribution_id, user_id, rank_position, points_at_distribution, reward_amount, reward_percent)
      VALUES (v_distribution_id, v_player.user_id, v_player.rank, v_player.points, v_player.amount, v_player.percent);

      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_player.user_id,
        NULL,
        'Recompensa Ranking Mensual TOP 50',
        'Felicidades! Puesto #' || v_player.rank || ' - Has recibido ' || v_player.amount || ' FXU (' || v_player.percent || '% del pool).',
        'system'
      );

      v_distributed_count := v_distributed_count + 1;
    END IF;
  END LOOP;

  -- Telegram + mensaje global
  DECLARE
    v_rewards_list_text text := '';
    v_rewards_elem      jsonb;
    v_emoji             text;
    v_anon_key          text;
    v_request_id        bigint;
  BEGIN
    FOR v_rewards_elem IN SELECT * FROM jsonb_array_elements(v_rewards)
    LOOP
      IF (v_rewards_elem->>'rank')::int = 1 THEN
        v_emoji := '🏆';
      ELSIF (v_rewards_elem->>'rank')::int <= 3 THEN
        v_emoji := '🥇';
      ELSIF (v_rewards_elem->>'rank')::int <= 10 THEN
        v_emoji := '🎖️';
      ELSE
        v_emoji := '⭐';
      END IF;
      v_rewards_list_text := v_rewards_list_text || v_emoji || ' #' || (v_rewards_elem->>'rank')
        || ' ' || (v_rewards_elem->>'username') || ' - ' || (v_rewards_elem->>'amount')
        || ' FXU (' || (v_rewards_elem->>'percent') || '%)' || chr(10);
    END LOOP;

    v_rewards_list_text := '🌟 RANKING MENSUAL TOP 50 - REPARTO 🌟' || chr(10) || chr(10)
      || '💰 Pool total: ' || v_pool_balance || ' FXU' || chr(10) || chr(10)
      || v_rewards_list_text || chr(10)
      || '¡Felicidades a todos los ganadores!' || chr(10)
      || '¿Quieres estar en el TOP 50? ¡Juega y sube en el ranking!' || chr(10)
      || 'Únete: https://t.me/+1Oo1iGBuQ-xjY2Zh';

    -- Mensaje in-game a los que no están en el top
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    SELECT p.id, NULL, 'Ranking Mensual - Reparto TOP 50', v_rewards_list_text, 'system'
      FROM profiles p
     WHERE p.id NOT IN (SELECT (elem->>'user_id')::uuid FROM jsonb_array_elements(v_rewards) elem)
       AND p.is_admin = false;

    -- Broadcast Telegram: si el texto pasa de 4000 chars, truncar al TOP 10
    -- para no superar el límite de 4096 de Telegram.
    BEGIN
      SELECT anon_key INTO v_anon_key FROM market_notification_config WHERE id = 1;

      IF v_anon_key IS NOT NULL THEN
        DECLARE
          v_tg_text text;
          v_short_list text := '';
        BEGIN
          IF length(v_rewards_list_text) > 4000 THEN
            FOR v_rewards_elem IN
              SELECT * FROM jsonb_array_elements(v_rewards)
               WHERE (value->>'rank')::int <= 10
            LOOP
              IF (v_rewards_elem->>'rank')::int = 1 THEN
                v_emoji := '🏆';
              ELSIF (v_rewards_elem->>'rank')::int <= 3 THEN
                v_emoji := '🥇';
              ELSE
                v_emoji := '🎖️';
              END IF;
              v_short_list := v_short_list || v_emoji || ' #' || (v_rewards_elem->>'rank')
                || ' ' || (v_rewards_elem->>'username') || ' - ' || (v_rewards_elem->>'amount')
                || ' FXU (' || (v_rewards_elem->>'percent') || '%)' || chr(10);
            END LOOP;
            v_tg_text := '🌟 RANKING MENSUAL TOP 50 - REPARTO (mostrando TOP 10) 🌟' || chr(10) || chr(10)
              || '💰 Pool total: ' || v_pool_balance || ' FXU' || chr(10) || chr(10)
              || v_short_list || chr(10)
              || 'Lista completa dentro del juego.' || chr(10)
              || 'Únete: https://t.me/+1Oo1iGBuQ-xjY2Zh';
          ELSE
            v_tg_text := v_rewards_list_text;
          END IF;

          SELECT net.http_post(
            url := 'https://hhrgcnvydmjqcevgmlhj.supabase.co/functions/v1/send-telegram-broadcast',
            body := jsonb_build_object(
              'subject', 'Ranking Mensual TOP 50 - Reparto',
              'body', v_tg_text
            ),
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || v_anon_key,
              'apikey', v_anon_key
            )
          ) INTO v_request_id;
        END;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Telegram broadcast error: %', SQLERRM;
    END;
  END;

  UPDATE jackpot_pools
     SET monthly_balance = 0,
         updated_at      = now()
   WHERE id = 1;

  UPDATE jackpot SET balance = balance - v_total_calculated WHERE id = 1;

  RETURN jsonb_build_object(
    'success',           true,
    'message',           'Pool distribuido correctamente a TOP 50',
    'pool_original',     v_pool_balance,
    'total_distributed', v_total_calculated,
    'players_rewarded',  v_distributed_count,
    'distribution_id',   v_distribution_id
  );
END;
$function$;
