-- [RANK1] Rankings por juego (ruleta, tragaperras, dados, batalla de naves).
--   * Una sola RPC de solo lectura: casino_leaderboard(p_game, p_period).
--   * SECURITY DEFINER + search_path fijo; solo usuarios autenticados (anon/PUBLIC revocado).
--   * Devuelve solo datos agregados: nombre de usuario y totales. Nunca ids, emails ni saldos.
--   * Excluye cuentas ocultas o baneadas.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION public.casino_leaderboard(p_game text, p_period text DEFAULT 'week')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_since timestamptz;
  v_top   jsonb;
  v_big   jsonb;
  v_me    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  IF p_game IS NULL OR p_game NOT IN ('roulette', 'slots', 'dice', 'battleship') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Juego invalido');
  END IF;
  v_since := CASE p_period
    WHEN 'day'  THEN now() - interval '1 day'
    WHEN 'week' THEN now() - interval '7 days'
    WHEN 'all'  THEN '-infinity'::timestamptz
  END;
  IF v_since IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Periodo invalido');
  END IF;

  WITH plays AS (
    SELECT s.user_id, s.total_bet AS bet, s.payout, (s.payout > s.total_bet) AS won, s.created_at AS at
      FROM casino_roulette_spins s WHERE p_game = 'roulette' AND s.created_at >= v_since
    UNION ALL
    SELECT s.user_id, s.bet, s.payout, (s.payout > s.bet), s.created_at
      FROM casino_slots_spins s WHERE p_game = 'slots' AND s.created_at >= v_since
    UNION ALL
    SELECT d.user_id, d.total_bet, d.payout, (d.payout > d.total_bet), d.created_at
      FROM casino_dice_rolls d WHERE p_game = 'dice' AND d.created_at >= v_since
    UNION ALL
    SELECT x.uid, m.stake, CASE WHEN m.winner = x.uid THEN m.payout ELSE 0 END, (m.winner = x.uid), m.finished_at
      FROM battleship_matches m
      CROSS JOIN LATERAL (VALUES (m.player1), (m.player2)) AS x(uid)
     WHERE p_game = 'battleship' AND m.status = 'finished' AND m.winner IS NOT NULL
       AND x.uid IS NOT NULL AND m.finished_at >= v_since
  ),
  visible AS (
    SELECT p.* FROM plays p
      JOIN profiles pr ON pr.id = p.user_id
     WHERE NOT COALESCE(pr.is_hidden, false) AND NOT COALESCE(pr.is_banned, false)
  ),
  agg AS (
    SELECT v.user_id,
           count(*)                          AS plays,
           count(*) FILTER (WHERE v.won)     AS wins,
           round(sum(v.payout - v.bet), 2)   AS net,
           round(max(v.payout), 2)           AS best
      FROM visible v
     GROUP BY v.user_id
  ),
  -- Battleship: por victorias. Casino: por ganancia neta (solo quien va en positivo).
  ranked AS (
    SELECT a.user_id,
           row_number() OVER (ORDER BY CASE WHEN p_game = 'battleship' THEN a.wins END DESC NULLS LAST,
                                       a.net DESC, a.wins DESC, a.plays ASC) AS rnk
      FROM agg a
     WHERE (p_game = 'battleship' AND a.wins > 0) OR (p_game <> 'battleship' AND a.net > 0)
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'rank', r.rnk, 'username', COALESCE(pr.username, 'Jugador'),
              'plays', a.plays, 'wins', a.wins, 'net', a.net, 'best', a.best,
              'is_me', a.user_id = v_uid) ORDER BY r.rnk), '[]'::jsonb)
       FROM ranked r JOIN agg a ON a.user_id = r.user_id JOIN profiles pr ON pr.id = r.user_id
      WHERE r.rnk <= 10),
    (SELECT jsonb_build_object('rank', r.rnk, 'plays', a.plays, 'wins', a.wins, 'net', a.net, 'best', a.best)
       FROM agg a LEFT JOIN ranked r ON r.user_id = a.user_id WHERE a.user_id = v_uid)
  INTO v_top, v_me;

  SELECT COALESCE(jsonb_agg(b.obj ORDER BY b.payout DESC, b.at DESC), '[]'::jsonb) INTO v_big
    FROM (
      SELECT jsonb_build_object('username', COALESCE(pr.username, 'Jugador'), 'bet', round(w.bet, 2),
                                'payout', round(w.payout, 2), 'at', w.at, 'is_me', w.user_id = v_uid) AS obj,
             w.payout, w.at
        FROM (
          SELECT s.user_id, s.total_bet AS bet, s.payout, s.created_at AS at
            FROM casino_roulette_spins s WHERE p_game = 'roulette' AND s.created_at >= v_since AND s.payout > s.total_bet
          UNION ALL
          SELECT s.user_id, s.bet, s.payout, s.created_at
            FROM casino_slots_spins s WHERE p_game = 'slots' AND s.created_at >= v_since AND s.payout > s.bet
          UNION ALL
          SELECT d.user_id, d.total_bet, d.payout, d.created_at
            FROM casino_dice_rolls d WHERE p_game = 'dice' AND d.created_at >= v_since AND d.payout > d.total_bet
          UNION ALL
          SELECT m.winner, m.stake, m.payout, m.finished_at
            FROM battleship_matches m
           WHERE p_game = 'battleship' AND m.status = 'finished' AND m.winner IS NOT NULL
             AND m.finished_at >= v_since AND m.payout > 0
        ) w
        JOIN profiles pr ON pr.id = w.user_id
       WHERE NOT COALESCE(pr.is_hidden, false) AND NOT COALESCE(pr.is_banned, false)
       ORDER BY w.payout DESC, w.at DESC
       LIMIT 5
    ) b;

  RETURN jsonb_build_object('success', true, 'game', p_game, 'period', p_period,
                            'top', v_top, 'big', v_big, 'me', v_me);
END;
$$;

REVOKE ALL ON FUNCTION public.casino_leaderboard(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.casino_leaderboard(text, text) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
