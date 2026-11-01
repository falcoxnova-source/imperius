-- ============================================================================
-- FIX: get_public_game_stats devolvia datos irreales en el banner publico
--
-- PROBLEMAS DETECTADOS (verificados contra produccion 2026-08-12):
--
-- 1) DEPOSITOS / RETIROS
--    Filtraba `token_type = 'USDT'`, pero el 99.9% del movimiento real esta
--    en filas `token_type = 'TUNG'`:
--      deposit    confirmed TUNG   47 filas  717946.14 TUNG
--      deposit    confirmed USDT    5 filas       6.10 USDT
--      withdrawal confirmed TUNG   32 filas  412210.00 TUNG
--    Resultado: mostraba $6.10 depositado y $0.00 retirado.
--    FIX: se suman las filas TUNG convertidas al precio real de TUNG y se
--    agregan las filas nativas USDT tal cual. Misma logica que usa el panel
--    admin (financialStats * get_live_tung_price_usd()).
--
-- 2) JACKPOT
--    total_jackpot_fxu = expedition_balance + monthly_balance unicamente.
--    Faltaban los pools plus_balance (Fortaleza 50%) y destruction_balance
--    (Planeta del Tesoro 40%), que son los dos mas grandes.
--    Resultado: 29.211 TUNG en vez de los 87.474 TUNG reales.
--    FIX: se suman los 4 pools y ademas se exponen por separado.
--
-- 3) TIPO DE CAMBIO
--    Se usaba el peg legacy fijo 0.0001 USD/TUNG (game_settings.fxu_usd_rate)
--    tanto aqui (volumen P2P) como hardcodeado en el frontend, mientras que
--    el precio real vivo es game_settings.tung_price_usd = 0.001204 (el que
--    usa el panel admin y la wallet). Diferencia de ~12x.
--    FIX: se usa get_live_tung_price_usd() y se expone `tung_price_usd` en el
--    payload para que el frontend no vuelva a hardcodear ninguna tasa.
--
-- NO se toca ninguna logica de negocio: esta funcion es solo de lectura
-- (STABLE/SECURITY DEFINER) y su unico consumidor es el banner publico.
-- Todas las claves anteriores del JSON se mantienen con el mismo nombre.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_game_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_total_players        bigint  := 0;
  v_ranked_players       bigint  := 0;
  v_tung_price           numeric := NULL;
  v_deposited_tung       numeric := 0;
  v_deposited_usdt       numeric := 0;
  v_withdrawn_tung       numeric := 0;
  v_withdrawn_usdt       numeric := 0;
  v_total_deposited      numeric := 0;
  v_total_withdrawn      numeric := 0;
  v_market_transactions  bigint  := 0;
  v_market_volume_fxu    numeric := 0;
  v_market_volume_usdt   numeric := 0;
  v_expedition_pool_fxu  numeric := 0;
  v_monthly_pool_fxu     numeric := 0;
  v_fortress_pool_fxu    numeric := 0;
  v_treasure_pool_fxu    numeric := 0;
  v_total_jackpot_fxu    numeric := 0;
BEGIN
  -- ---------------------------------------------------------------
  -- Precio real de TUNG en USD (misma fuente que el panel admin).
  -- Cadena de respaldo: precio vivo -> ultimo precio guardado -> peg legacy.
  -- ---------------------------------------------------------------
  BEGIN
    v_tung_price := get_live_tung_price_usd();
  EXCEPTION WHEN OTHERS THEN v_tung_price := NULL; END;

  IF v_tung_price IS NULL OR v_tung_price <= 0 THEN
    BEGIN
      SELECT NULLIF(value, '')::numeric INTO v_tung_price
      FROM game_settings WHERE key = 'tung_price_usd';
    EXCEPTION WHEN OTHERS THEN v_tung_price := NULL; END;
  END IF;

  IF v_tung_price IS NULL OR v_tung_price <= 0 THEN
    BEGIN
      SELECT NULLIF(value, '')::numeric INTO v_tung_price
      FROM game_settings WHERE key = 'fxu_usd_rate';
    EXCEPTION WHEN OTHERS THEN v_tung_price := NULL; END;
  END IF;

  IF v_tung_price IS NULL OR v_tung_price <= 0 THEN
    v_tung_price := 0.0001;
  END IF;

  -- Total de jugadores registrados (no baneados)
  BEGIN
    SELECT COUNT(*) INTO v_total_players
    FROM profiles WHERE COALESCE(is_banned, false) = false;
  EXCEPTION WHEN OTHERS THEN v_total_players := 0; END;

  -- Jugadores en ranking (con puntos)
  BEGIN
    SELECT COUNT(*) INTO v_ranked_players
    FROM profiles
    WHERE COALESCE(is_banned, false) = false AND COALESCE(points_total, 0) > 0;
  EXCEPTION WHEN OTHERS THEN v_ranked_players := 0; END;

  -- Depositos confirmados: TUNG (convertido) + USDT nativo
  BEGIN
    SELECT
      COALESCE(SUM(CASE WHEN token_type = 'USDT' THEN 0 ELSE fxu_amount END), 0),
      COALESCE(SUM(CASE WHEN token_type = 'USDT' THEN fxu_amount ELSE 0 END), 0)
    INTO v_deposited_tung, v_deposited_usdt
    FROM wallet_transactions
    WHERE tx_type = 'deposit' AND status = 'confirmed';
  EXCEPTION WHEN OTHERS THEN
    v_deposited_tung := 0; v_deposited_usdt := 0;
  END;

  -- Retiros confirmados: TUNG (convertido) + USDT nativo
  BEGIN
    SELECT
      COALESCE(SUM(CASE WHEN token_type = 'USDT' THEN 0 ELSE fxu_amount END), 0),
      COALESCE(SUM(CASE WHEN token_type = 'USDT' THEN fxu_amount ELSE 0 END), 0)
    INTO v_withdrawn_tung, v_withdrawn_usdt
    FROM wallet_transactions
    WHERE tx_type = 'withdrawal' AND status = 'confirmed';
  EXCEPTION WHEN OTHERS THEN
    v_withdrawn_tung := 0; v_withdrawn_usdt := 0;
  END;

  v_total_deposited := (v_deposited_tung * v_tung_price) + v_deposited_usdt;
  v_total_withdrawn := (v_withdrawn_tung * v_tung_price) + v_withdrawn_usdt;

  -- Transacciones y volumen P2P del mercado (total_price esta en TUNG/FXU)
  BEGIN
    SELECT COUNT(*), COALESCE(SUM(total_price), 0)
    INTO v_market_transactions, v_market_volume_fxu
    FROM market_transactions;
  EXCEPTION WHEN OTHERS THEN
    v_market_transactions := 0; v_market_volume_fxu := 0;
  END;

  v_market_volume_usdt := v_market_volume_fxu * v_tung_price;

  -- Pools del jackpot: expedicion + mensual (50 TOP) + fortaleza + tesoro
  BEGIN
    SELECT
      COALESCE(expedition_balance, 0),
      COALESCE(monthly_balance, 0),
      COALESCE(plus_balance, 0),
      COALESCE(destruction_balance, 0)
    INTO v_expedition_pool_fxu, v_monthly_pool_fxu, v_fortress_pool_fxu, v_treasure_pool_fxu
    FROM jackpot_pools WHERE id = 1;
  EXCEPTION WHEN OTHERS THEN
    v_expedition_pool_fxu := 0; v_monthly_pool_fxu := 0;
    v_fortress_pool_fxu := 0;   v_treasure_pool_fxu := 0;
  END;

  v_expedition_pool_fxu := COALESCE(v_expedition_pool_fxu, 0);
  v_monthly_pool_fxu    := COALESCE(v_monthly_pool_fxu, 0);
  v_fortress_pool_fxu   := COALESCE(v_fortress_pool_fxu, 0);
  v_treasure_pool_fxu   := COALESCE(v_treasure_pool_fxu, 0);

  v_total_jackpot_fxu := v_expedition_pool_fxu + v_monthly_pool_fxu
                       + v_fortress_pool_fxu + v_treasure_pool_fxu;

  RETURN jsonb_build_object(
    -- claves historicas (mismo nombre, ahora con valores reales)
    'total_players',       COALESCE(v_total_players, 0),
    'ranked_players',      COALESCE(v_ranked_players, 0),
    'total_deposited',     ROUND(v_total_deposited, 2),
    'total_withdrawn',     ROUND(v_total_withdrawn, 2),
    'market_transactions', COALESCE(v_market_transactions, 0),
    'market_volume_usdt',  ROUND(v_market_volume_usdt, 2),
    'expedition_pool_fxu', ROUND(v_expedition_pool_fxu, 3),
    'monthly_pool_fxu',    ROUND(v_monthly_pool_fxu, 3),
    'total_jackpot_fxu',   ROUND(v_total_jackpot_fxu, 3),
    -- claves nuevas
    'fortress_pool_fxu',   ROUND(v_fortress_pool_fxu, 3),
    'treasure_pool_fxu',   ROUND(v_treasure_pool_fxu, 3),
    'total_deposited_tung',  ROUND(v_deposited_tung, 2),
    'total_withdrawn_tung',  ROUND(v_withdrawn_tung, 2),
    'market_volume_fxu',   ROUND(v_market_volume_fxu, 3),
    'total_jackpot_usdt',  ROUND(v_total_jackpot_fxu * v_tung_price, 2),
    'tung_price_usd',      v_tung_price
  );
EXCEPTION WHEN OTHERS THEN
  -- Ultra-fallback: nunca romper el login
  RETURN jsonb_build_object(
    'total_players', 0, 'ranked_players', 0,
    'total_deposited', 0, 'total_withdrawn', 0,
    'market_transactions', 0, 'market_volume_usdt', 0,
    'expedition_pool_fxu', 0, 'monthly_pool_fxu', 0, 'total_jackpot_fxu', 0,
    'fortress_pool_fxu', 0, 'treasure_pool_fxu', 0,
    'total_deposited_tung', 0, 'total_withdrawn_tung', 0,
    'market_volume_fxu', 0, 'total_jackpot_usdt', 0,
    'tung_price_usd', 0.0001
  );
END;
$function$;

COMMIT;

\echo '=== resultado despues del fix ==='
SELECT jsonb_pretty(get_game_stats());
