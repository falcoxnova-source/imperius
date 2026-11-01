-- ============================================================================
-- 20260713_referral_economy_core.sql
-- Nueva logica de negocio de referidos (20%) — PARTE A (nucleo)
--
-- Modelo unificado para gastos del juego (oficiales, misiones premium,
-- acelerar vuelo/construccion/investigacion/astillero, cajas, cosmeticos,
-- transferencias, recarga de colonia):
--     fee/costo -> 50% POOL (destruccion) / 50% EMPRESA
--     referido  -> 20% de la parte de EMPRESA (= 10% del total)
--     sin referido -> esa parte se queda la EMPRESA
--
-- P2P y retiros: referido = 20% del fee (se ajusta via game_settings).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Ajustes de reparto (game_settings)
-- ----------------------------------------------------------------------------

-- Gastos del juego (distribute_spend_fee)
INSERT INTO game_settings (key, value, description, updated_at) VALUES
  ('spend_split_pool_share', '50', 'Gastos del juego: % del costo que va al pool de destruccion', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO game_settings (key, value, description, updated_at) VALUES
  ('spend_split_admin_share', '50', 'Gastos del juego: % del costo que se queda la empresa (informativo; se calcula como resto)', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO game_settings (key, value, description, updated_at) VALUES
  ('spend_referral_of_company_pct', '20', 'Gastos del juego: % de la parte de empresa que gana el referido', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- P2P: referido = 20% del fee (admin 50 / pool 30 / referido 20)
INSERT INTO game_settings (key, value, description, updated_at) VALUES
  ('p2p_fee_admin_share', '50', 'P2P: % del fee para la empresa', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
INSERT INTO game_settings (key, value, description, updated_at) VALUES
  ('p2p_fee_pool_share', '30', 'P2P: % del fee para el pool', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
INSERT INTO game_settings (key, value, description, updated_at) VALUES
  ('p2p_fee_referrer_share', '20', 'P2P: % del fee para el referido', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Retiro TUNG: admin 50 / pool 30 / referido 20 (deben sumar 100)
INSERT INTO game_settings (key, value, description, updated_at) VALUES
  ('withdrawal_fee_admin_share', '50', 'Retiro: % del fee para la empresa', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
INSERT INTO game_settings (key, value, description, updated_at) VALUES
  ('withdrawal_fee_pool_share', '30', 'Retiro: % del fee para el pool', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
INSERT INTO game_settings (key, value, description, updated_at) VALUES
  ('withdrawal_fee_referral_share', '20', 'Retiro: % del fee para el referido', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ----------------------------------------------------------------------------
-- 2) distribute_spend_fee: nuevo modelo pool/empresa/referido
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribute_spend_fee(
  p_amount numeric,
  p_source text,
  p_revenue_type text,
  p_user_id uuid,
  p_description text DEFAULT NULL::text,
  p_related_tx_id uuid DEFAULT NULL::uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pool_pct numeric;
  v_ref_of_company_pct numeric;
  v_pool_share numeric;
  v_company_gross numeric;
  v_referrer_share numeric;
  v_admin_share numeric;
  v_referrer_id uuid;
  v_admin_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(value::numeric, 50) INTO v_pool_pct
  FROM game_settings WHERE key = 'spend_split_pool_share';
  SELECT COALESCE(value::numeric, 20) INTO v_ref_of_company_pct
  FROM game_settings WHERE key = 'spend_referral_of_company_pct';

  v_pool_pct := COALESCE(v_pool_pct, 50);
  v_ref_of_company_pct := COALESCE(v_ref_of_company_pct, 20);
  IF v_pool_pct < 0 THEN v_pool_pct := 0; END IF;
  IF v_pool_pct > 100 THEN v_pool_pct := 100; END IF;
  IF v_ref_of_company_pct < 0 THEN v_ref_of_company_pct := 0; END IF;
  IF v_ref_of_company_pct > 100 THEN v_ref_of_company_pct := 100; END IF;

  -- Pool = pool_pct% del importe
  v_pool_share := FLOOR(p_amount * v_pool_pct / 100);
  -- Empresa = resto (absorbe redondeo)
  v_company_gross := p_amount - v_pool_share;

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = p_user_id;

  IF v_referrer_id IS NOT NULL THEN
    -- Referido = % de la parte de empresa
    v_referrer_share := FLOOR(v_company_gross * v_ref_of_company_pct / 100);
  ELSE
    -- Sin referido: se queda la empresa
    v_referrer_share := 0;
  END IF;

  v_admin_share := v_company_gross - v_referrer_share;
  IF v_admin_share < 0 THEN v_admin_share := 0; END IF;

  -- Habilitar el contexto para mover fxu_balance (trigger de proteccion)
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Empresa: wallet admin + ledger financiero
  IF v_admin_share > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL AND v_admin_id != p_user_id THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_admin_share WHERE id = v_admin_id;
    END IF;
    PERFORM record_admin_revenue(p_revenue_type, v_admin_share, COALESCE(p_description, p_source), p_user_id, p_related_tx_id);
  END IF;

  -- Pool: jackpot / destruccion
  IF v_pool_share > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_share, p_source, p_user_id);
  END IF;

  -- Referido: comision directa (sin spam de mensajes)
  IF v_referrer_share > 0 AND v_referrer_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_referrer_share WHERE id = v_referrer_id;
    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer_id, p_user_id, NULL, p_source || '_referral', v_referrer_share);
  END IF;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3) purchase_daily_mission_bonus: conectar reparto pool/empresa/referido
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_daily_mission_bonus(p_user_id uuid, p_mission_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mission record;
  v_fxu_balance numeric;
  v_bonus_id uuid;
  v_existing integer;
  v_price numeric;
  v_cost bigint;
BEGIN
  SELECT * INTO v_mission
  FROM daily_missions
  WHERE id = p_mission_id
    AND is_active = true
    AND (cost_fxu > 0 OR (cost_usd IS NOT NULL AND cost_usd > 0));

  IF v_mission IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mision premium no encontrada');
  END IF;

  -- Calcular costo efectivo en TUNG
  IF v_mission.cost_usd IS NOT NULL AND v_mission.cost_usd > 0 THEN
    v_price := get_live_tung_price_usd();
    IF v_price IS NULL OR v_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Precio de TUNG no disponible, intenta de nuevo en unos minutos');
    END IF;
    v_cost := ceil(v_mission.cost_usd / v_price)::bigint;
  ELSE
    v_cost := v_mission.cost_fxu;
  END IF;

  SELECT COUNT(*) INTO v_existing
  FROM user_active_bonuses
  WHERE user_id = p_user_id AND mission_id = p_mission_id AND expires_at > now();

  IF v_existing > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes este bono activo. Espera a que expire.');
  END IF;

  SELECT fxu_balance INTO v_fxu_balance
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_fxu_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficientes. Necesitas ' || v_cost || ' TUNG');
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
  UPDATE profiles SET fxu_balance = fxu_balance - v_cost WHERE id = p_user_id;

  -- Reparto pool/empresa/referido del costo de la mision premium
  PERFORM distribute_spend_fee(v_cost, 'premium_mission', 'premium_mission', p_user_id,
    'Mision premium #' || p_mission_id, NULL);

  INSERT INTO user_active_bonuses (user_id, mission_id, bonus_type, bonus_value, expires_at)
  VALUES (p_user_id, p_mission_id, v_mission.reward_type, v_mission.reward_value, now() + (v_mission.reward_duration_hours || ' hours')::interval)
  RETURNING id INTO v_bonus_id;

  RETURN jsonb_build_object(
    'success', true,
    'bonus_type', v_mission.reward_type,
    'bonus_value', v_mission.reward_value,
    'expires_at', now() + (v_mission.reward_duration_hours || ' hours')::interval,
    'cost_fxu', v_cost,
    'cost_usd', v_mission.cost_usd
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4) accelerate_fleet: usar reparto pool/empresa/referido (antes: jackpot 49% + ledger)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accelerate_fleet(p_fleet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_fleet fleets%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_pool_pct numeric;
  v_jackpot_amount numeric;
  v_target_planet planets%ROWTYPE;
  v_defender_id uuid;
  v_origin_coords text;
  v_is_hostile boolean;
  v_one_way_flight_interval interval;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_fleet
  FROM fleets
  WHERE id = p_fleet_id
  FOR UPDATE;

  IF v_fleet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada');
  END IF;

  IF v_fleet.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres el propietario de esta flota');
  END IF;

  IF v_fleet.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya ha llegado');
  END IF;

  v_fxu_cost := calculate_fxu_cost_fleet(p_fleet_id);

  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota esta a punto de llegar');
  END IF;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

  IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FXU insuficiente. Necesitas ' || v_fxu_cost || ' FXU (tienes ' || COALESCE(v_current_fxu, 0)::integer || ')'
    );
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles
  SET fxu_balance = fxu_balance - v_fxu_cost
  WHERE id = v_user_id;

  -- Reparto pool/empresa/referido del costo de aceleracion
  PERFORM distribute_spend_fee(v_fxu_cost, 'fleet_acceleration', 'fleet_acceleration', v_user_id,
    'Aceleracion de flota ' || v_fleet.mission_type ||
    CASE WHEN v_fleet.is_returning THEN ' (regreso)' ELSE '' END, NULL);

  -- Solo para el valor informativo de retorno
  SELECT COALESCE(value::numeric, 50) INTO v_pool_pct FROM game_settings WHERE key = 'spend_split_pool_share';
  v_jackpot_amount := FLOOR(v_fxu_cost * COALESCE(v_pool_pct, 50) / 100);

  v_is_hostile := v_fleet.mission_type IN ('attack', 'espionage', 'acs_attack') AND NOT v_fleet.is_returning;

  IF v_is_hostile THEN
    SELECT p.* INTO v_target_planet
    FROM planets p
    WHERE p.galaxy = v_fleet.target_galaxy
      AND p.solar_system = v_fleet.target_system
      AND p.position = v_fleet.target_position
    LIMIT 1;

    IF v_target_planet IS NOT NULL AND v_target_planet.user_id != v_user_id THEN
      v_defender_id := v_target_planet.user_id;

      SELECT '[' || p.galaxy || ':' || p.solar_system || ':' || p.position || ']' INTO v_origin_coords
      FROM planets p WHERE p.id = v_fleet.origin_planet_id;

      INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
      VALUES (
        v_defender_id,
        'Sistema de Defensa',
        'ALERTA: Flota hostil acelerada',
        'Una flota hostil de tipo "' || v_fleet.mission_type || '" procedente de ' || COALESCE(v_origin_coords, 'coordenadas desconocidas') ||
        ' ha sido ACELERADA y llegara antes de lo previsto a tu planeta en [' ||
        v_fleet.target_galaxy || ':' || v_fleet.target_system || ':' || v_fleet.target_position || '].' ||
        E'\n\nPrepara tus defensas inmediatamente.',
        'combat'
      );
    END IF;
  END IF;

  IF v_fleet.is_returning THEN
    UPDATE fleets
    SET return_time = now() - interval '1 second'
    WHERE id = p_fleet_id;
  ELSE
    v_one_way_flight_interval := v_fleet.arrival_time - v_fleet.departure_time;

    UPDATE fleets
    SET arrival_time = now() - interval '1 second',
        return_time = now() + v_one_way_flight_interval
    WHERE id = p_fleet_id;
  END IF;

  PERFORM process_fleet_arrival(p_fleet_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota acelerada exitosamente',
    'fxu_spent', v_fxu_cost,
    'jackpot_contribution', v_jackpot_amount
  );
END;
$function$;

COMMIT;
