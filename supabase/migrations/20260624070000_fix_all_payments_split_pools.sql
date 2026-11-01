-- =====================================================================
-- Reparto de pagos: empresa / pool / referido (40/30/30 configurable)
-- Aplica el mismo modelo del mercado y los retiros a TODOS los pagos
-- internos que hoy iban 100% a la empresa (o a nadie, como la racha).
-- =====================================================================

-- 1) Permitir el tipo 'daily_streak' en el ledger de ingresos
ALTER TABLE public.admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
ALTER TABLE public.admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check
  CHECK (revenue_type = ANY (ARRAY[
    'market_fee','withdrawal_fee','instant_build','instant_research','instant_ship',
    'referral_bonus','officer_fxu','expedition_fee','supply_box','fleet_acceleration',
    'swap_fee','transfer_fee','plus_subscription','colony_abandon','planet_rename',
    'alliance_rename','alliance_creation','lottery_fee','p2p_fee','blueprint_sale',
    'hero_respec','other','premium_mission','hero_duel','daily_streak'
  ]::text[]));

-- 2) Porcentajes de reparto (configurables, default 40/30/30)
INSERT INTO public.game_settings (key, value)
VALUES ('spend_split_admin_share','40')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.game_settings (key, value)
VALUES ('spend_split_pool_share','30')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.game_settings (key, value)
VALUES ('spend_split_referral_share','30')
ON CONFLICT (key) DO NOTHING;

-- 3) Funcion unica de reparto.
--    Se llama DESPUES de haber descontado el FXU al usuario; reparte ese
--    importe entre empresa (wallet admin + ledger), pool (jackpot) y referido.
CREATE OR REPLACE FUNCTION public.distribute_spend_fee(
  p_amount numeric,
  p_source text,
  p_revenue_type text,
  p_user_id uuid,
  p_description text DEFAULT NULL,
  p_related_tx_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_pct numeric;
  v_pool_pct numeric;
  v_referral_pct numeric;
  v_admin_share numeric;
  v_pool_share numeric;
  v_referrer_share numeric;
  v_referrer_id uuid;
  v_admin_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(value::numeric, 40) INTO v_admin_pct FROM game_settings WHERE key = 'spend_split_admin_share';
  SELECT COALESCE(value::numeric, 30) INTO v_pool_pct FROM game_settings WHERE key = 'spend_split_pool_share';
  SELECT COALESCE(value::numeric, 30) INTO v_referral_pct FROM game_settings WHERE key = 'spend_split_referral_share';
  v_admin_pct := COALESCE(v_admin_pct, 40);
  v_pool_pct := COALESCE(v_pool_pct, 30);
  v_referral_pct := COALESCE(v_referral_pct, 30);

  v_pool_share := FLOOR(p_amount * v_pool_pct / 100);

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = p_user_id;

  IF v_referrer_id IS NOT NULL THEN
    v_referrer_share := FLOOR(p_amount * v_referral_pct / 100);
  ELSE
    -- Sin referido: su parte se acumula en el pool
    v_referrer_share := 0;
    v_pool_share := v_pool_share + FLOOR(p_amount * v_referral_pct / 100);
  END IF;

  -- La empresa absorbe el redondeo para que se reparta el importe completo
  v_admin_share := p_amount - v_pool_share - v_referrer_share;
  IF v_admin_share < 0 THEN
    v_admin_share := 0;
  END IF;

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

  -- Pool: jackpot
  IF v_pool_share > 0 THEN
    PERFORM contribute_to_jackpot(v_pool_share, p_source, p_user_id);
  END IF;

  -- Referido: comision directa (registrada en referral_commissions, sin spam de mensajes)
  IF v_referrer_share > 0 AND v_referrer_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_referrer_share WHERE id = v_referrer_id;
    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, fxu_amount)
    VALUES (v_referrer_id, p_user_id, NULL, p_source || '_referral', v_referrer_share);
  END IF;
END;
$function$;

-- =====================================================================
-- 4) Conectar cada pago al reparto
-- =====================================================================

-- 4.1) Racha diaria: antes no acreditaba a NADIE (el FXU desaparecia)
CREATE OR REPLACE FUNCTION public.activate_daily_streak()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_streak record;
  v_cost integer;
  v_balance numeric;
  v_new_streak integer;
  v_best_streak integer;
  v_now timestamptz := now();
  v_expires timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','No autenticado'); END IF;

  -- Read cost from game_settings, default 300
  SELECT COALESCE(NULLIF(value,'')::integer, 300) INTO v_cost
  FROM public.game_settings WHERE key = 'daily_streak_cost';
  IF v_cost IS NULL OR v_cost < 0 THEN v_cost := 300; END IF;

  SELECT fxu_balance INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object('success',false,'error','FXU insuficiente. Necesitas '||v_cost||' FXU.');
  END IF;

  SELECT streak_count, best_streak, expires_at INTO v_streak FROM user_daily_streaks WHERE user_id = v_user_id;
  v_expires := v_now + interval '24 hours';

  IF NOT FOUND OR v_streak.expires_at IS NULL OR v_streak.expires_at < v_now THEN
    v_new_streak := 1;
    v_best_streak := GREATEST(COALESCE(v_streak.best_streak,0), 1);
  ELSE
    v_new_streak := COALESCE(v_streak.streak_count,0) + 1;
    v_best_streak := GREATEST(COALESCE(v_streak.best_streak,0), v_new_streak);
  END IF;

  -- Deduct cost (bypass fxu protection trigger)
  ALTER TABLE profiles DISABLE TRIGGER protect_fxu_balance_trigger;
  UPDATE profiles SET fxu_balance = fxu_balance - v_cost WHERE id = v_user_id;
  ALTER TABLE profiles ENABLE TRIGGER protect_fxu_balance_trigger;

  -- Reparto empresa/pool/referido del costo de la racha
  PERFORM distribute_spend_fee(v_cost, 'daily_streak', 'daily_streak', v_user_id, 'Racha diaria', NULL);

  INSERT INTO user_daily_streaks (user_id, streak_count, best_streak, expires_at, activated_at)
  VALUES (v_user_id, v_new_streak, v_best_streak, v_expires, v_now)
  ON CONFLICT (user_id) DO UPDATE SET
    streak_count = v_new_streak,
    best_streak = GREATEST(user_daily_streaks.best_streak, v_best_streak),
    expires_at = v_expires,
    activated_at = v_now;

  RETURN jsonb_build_object(
    'success',true,
    'streak',v_new_streak,
    'best_streak',v_best_streak,
    'expires_at',v_expires,
    'cost',v_cost,
    'balance',v_balance - v_cost
  );
END;
$function$;

-- 4.2) Acelerar construccion de edificio (antes 100% empresa)
CREATE OR REPLACE FUNCTION public.instant_complete_building(p_queue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_remaining_seconds integer;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF is_user_in_vacation_mode(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot use instant complete while in vacation mode');
  END IF;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT bq.*, bt.name as building_name, p.user_id as planet_owner
  INTO v_queue_item
  FROM building_queue bq
  JOIN building_types bt ON bq.building_type_id = bt.id
  JOIN planets p ON bq.planet_id = p.id
  WHERE bq.id = p_queue_id AND bq.status = 'building';

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found or not building');
  END IF;

  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now()))::integer);
  v_fxu_cost := calculate_fxu_cost_building(p_queue_id);

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_current_fxu);
  END IF;

  PERFORM set_config('app.fxu_update_allowed', 'instant_complete_building', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Reparto empresa/pool/referido del costo
  PERFORM distribute_spend_fee(v_fxu_cost, 'instant_build', 'instant_build',
    v_user_id, 'Edificio: ' || COALESCE(v_queue_item.building_name, ''), p_queue_id);

  UPDATE building_queue SET end_time = now() - interval '1 second' WHERE id = p_queue_id;
  PERFORM complete_building_queue_item(p_queue_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$function$;

-- 4.3) Acelerar investigacion (overload uuid, el que usa el frontend)
CREATE OR REPLACE FUNCTION public.instant_complete_research(p_research_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_research RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_remaining_seconds integer;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF is_user_in_vacation_mode(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot use instant complete while in vacation mode');
  END IF;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT ur.*, rt.name as research_name
  INTO v_research
  FROM user_technologies ur
  JOIN technology_types rt ON ur.technology_type_id = rt.id
  WHERE ur.id = p_research_id AND ur.is_researching = true;

  IF v_research IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research not found or not in progress');
  END IF;

  IF v_research.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your research');
  END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_research.research_end_time - now()))::integer);
  v_fxu_cost := calculate_fxu_cost_research(p_research_id);

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_current_fxu);
  END IF;

  PERFORM set_config('app.fxu_update_allowed', 'instant_complete_research', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Reparto empresa/pool/referido del costo
  PERFORM distribute_spend_fee(v_fxu_cost, 'instant_research', 'instant_research',
    v_user_id, 'Investigacion: ' || COALESCE(v_research.research_name, ''), p_research_id);

  UPDATE user_technologies 
  SET level = level + 1, 
      is_researching = false, 
      research_end_time = NULL
  WHERE id = p_research_id;

  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$function$;

-- 4.4) Acelerar naves/defensas (instant_complete_shipyard_item, el que usa el frontend)
CREATE OR REPLACE FUNCTION public.instant_complete_shipyard_item(p_queue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_admin_id uuid;
  v_item_name text;
  v_item_id integer;
BEGIN
  v_user_id := auth.uid();
IF is_user_in_vacation_mode(v_user_id) THEN
RETURN jsonb_build_object('success', false, 'error', 'Cannot use instant complete while in vacation mode');
END IF;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT sq.id, sq.planet_id, sq.item_type, sq.ship_type_id, sq.defense_type_id, 
         sq.quantity, sq.quantity_completed, sq.build_time_per_unit,
         sq.queue_position, sq.start_time, sq.current_unit_end_time, p.user_id as planet_owner
  INTO v_queue_item
  FROM shipyard_queue sq
  JOIN planets p ON sq.planet_id = p.id
  WHERE sq.id = p_queue_id AND sq.queue_position = 1 AND sq.current_unit_end_time IS NOT NULL;

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found or not active');
  END IF;
  
  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_fxu_cost := calculate_fxu_cost_shipyard(p_queue_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Construction already complete');
  END IF;

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost);
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Determine the item_id and name based on type
  IF v_queue_item.item_type = 'ship' THEN
    v_item_id := v_queue_item.ship_type_id;
    SELECT name INTO v_item_name FROM ship_types WHERE id = v_item_id;
  ELSE
    v_item_id := v_queue_item.defense_type_id;
    SELECT name INTO v_item_name FROM defense_types WHERE id = v_item_id;
  END IF;

  -- Calculate remaining quantity
  DECLARE
    v_remaining_quantity integer;
  BEGIN
    v_remaining_quantity := v_queue_item.quantity - v_queue_item.quantity_completed;

    -- Reparto empresa/pool/referido del costo
    PERFORM distribute_spend_fee(v_fxu_cost, 'instant_ship', 'instant_ship',
      v_user_id, v_remaining_quantity || 'x ' || COALESCE(v_item_name, v_queue_item.item_type), p_queue_id);

    -- Add the items to the planet
    IF v_queue_item.item_type = 'ship' THEN
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (v_queue_item.planet_id, v_item_id, v_remaining_quantity)
      ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_remaining_quantity;
    ELSE
      INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
      VALUES (v_queue_item.planet_id, v_item_id, v_remaining_quantity)
      ON CONFLICT (planet_id, defense_type_id) DO UPDATE SET quantity = planet_defenses.quantity + v_remaining_quantity;
    END IF;

    -- Delete the queue item
    DELETE FROM shipyard_queue WHERE id = p_queue_id;

    -- Reorder remaining queue items and activate next item
    WITH reordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos 
      FROM shipyard_queue WHERE planet_id = v_queue_item.planet_id
    )
    UPDATE shipyard_queue sq SET 
      queue_position = r.new_pos,
      start_time = CASE WHEN r.new_pos = 1 AND sq.start_time IS NULL THEN NOW() ELSE sq.start_time END,
      current_unit_end_time = CASE WHEN r.new_pos = 1 AND sq.current_unit_end_time IS NULL THEN NOW() + (sq.build_time_per_unit || ' seconds')::interval ELSE sq.current_unit_end_time END
    FROM reordered r WHERE sq.id = r.id;

    PERFORM update_user_points(v_user_id);
    RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'quantity', v_remaining_quantity);
  END;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$function$;

-- 4.5) Compra de oficiales con FXU (antes 100% empresa)
CREATE OR REPLACE FUNCTION public.purchase_officer_with_fxu(p_officer_type_id uuid, p_duration text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_officer officer_types%ROWTYPE;
  v_usdt_cost numeric;
  v_live_price numeric;
  v_fxu_cost numeric;
  v_current_fxu numeric;
  v_days_to_add integer;
  v_existing_officer user_officers%ROWTYPE;
  v_new_expiry timestamptz;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_existing_officer
  FROM user_officers
  WHERE user_id = v_user_id
  AND officer_type_id = p_officer_type_id
  AND expires_at > NOW();

  IF v_existing_officer IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer is still active. Wait until it expires to purchase again.');
  END IF;

  SELECT * INTO v_officer FROM officer_types WHERE id = p_officer_type_id;
  IF v_officer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Officer type not found');
  END IF;

  -- USDT price by duration
  CASE p_duration
    WHEN '7d' THEN
      v_usdt_cost := v_officer.usdt_cost_7d;
      v_days_to_add := 7;
    WHEN '30d' THEN
      v_usdt_cost := v_officer.usdt_cost_30d;
      v_days_to_add := 30;
    WHEN '90d' THEN
      v_usdt_cost := v_officer.usdt_cost_90d;
      v_days_to_add := 90;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid duration');
  END CASE;

  IF v_usdt_cost IS NULL OR v_usdt_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio no configurado para este oficial');
  END IF;

  -- Live TUNG price (server-side, cannot be falsified by client)
  v_live_price := get_live_tung_price_usd();
  IF v_live_price IS NULL OR v_live_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio de TUNG no disponible, intenta de nuevo en unos segundos');
  END IF;

  -- TUNG amount, rounded up so we never undercharge
  v_fxu_cost := CEIL(v_usdt_cost / v_live_price);

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

  IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient TUNG balance');
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles
  SET fxu_balance = fxu_balance - v_fxu_cost
  WHERE id = v_user_id;

  -- Reparto empresa/pool/referido del costo
  PERFORM distribute_spend_fee(v_fxu_cost, 'officer_fxu', 'officer_fxu',
    v_user_id, 'Officer: ' || v_officer.name || ' (' || p_duration || ', $' || v_usdt_cost || ' USDT)', NULL);

  v_new_expiry := NOW() + (v_days_to_add || ' days')::interval;

  DELETE FROM user_officers
  WHERE user_id = v_user_id
  AND officer_type_id = p_officer_type_id;

  INSERT INTO user_officers (user_id, officer_type_id, expires_at)
  VALUES (v_user_id, p_officer_type_id, v_new_expiry);

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expiry,
    'fxu_spent', v_fxu_cost
  );
END;
$function$;

-- 4.6) Cajas de recursos (antes solo registraba en el ledger, sin wallet/pool/referido)
CREATE OR REPLACE FUNCTION public.purchase_supply_box(p_box_code text, p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_user_id uuid;
v_box supply_boxes%ROWTYPE;
v_planet planets%ROWTYPE;
v_current_fxu numeric;
v_calculated jsonb;
v_synced_metal numeric;
v_synced_crystal numeric;
v_synced_deuterium numeric;
BEGIN
v_user_id := auth.uid();

IF v_user_id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
END IF;

SELECT * INTO v_box FROM supply_boxes WHERE code = p_box_code AND is_active = true;

IF v_box.id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Caja no encontrada o no disponible');
END IF;

SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;

IF v_planet.id IS NULL THEN
RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado o no te pertenece');
END IF;

SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

IF v_current_fxu IS NULL OR v_current_fxu < v_box.price_fxu THEN
RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_box.price_fxu || ' FXU');
END IF;

v_calculated := calculate_planet_resources(p_planet_id);

IF v_calculated ? 'error' THEN
RETURN jsonb_build_object('success', false, 'error', 'Error calculando recursos del planeta');
END IF;

v_synced_metal := (v_calculated->>'metal')::numeric;
v_synced_crystal := (v_calculated->>'crystal')::numeric;
v_synced_deuterium := (v_calculated->>'deuterium')::numeric;

UPDATE planet_resources
SET 
metal = v_synced_metal,
crystal = v_synced_crystal,
deuterium = v_synced_deuterium,
metal_per_hour = (v_calculated->>'metal_per_hour')::numeric,
crystal_per_hour = (v_calculated->>'crystal_per_hour')::numeric,
deuterium_per_hour = (v_calculated->>'deuterium_per_hour')::numeric,
metal_storage = (v_calculated->>'metal_storage')::numeric,
crystal_storage = (v_calculated->>'crystal_storage')::numeric,
deuterium_storage = (v_calculated->>'deuterium_storage')::numeric,
energy_used = (v_calculated->>'energy_used')::numeric,
energy_max = (v_calculated->>'energy_max')::numeric,
last_update = now()
WHERE planet_id = p_planet_id;

PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

UPDATE profiles 
SET fxu_balance = fxu_balance - v_box.price_fxu 
WHERE id = v_user_id;

PERFORM set_config('fxu.allow_update_9x7k2m', '', true);

UPDATE planet_resources
SET 
metal = v_synced_metal + v_box.metal_amount,
crystal = v_synced_crystal + v_box.crystal_amount,
deuterium = v_synced_deuterium + v_box.deuterium_amount,
last_update = now()
WHERE planet_id = p_planet_id;

INSERT INTO supply_box_purchases (user_id, planet_id, box_id, box_name, metal_received, crystal_received, deuterium_received, fxu_paid)
VALUES (v_user_id, p_planet_id, v_box.id, v_box.name, v_box.metal_amount, v_box.crystal_amount, v_box.deuterium_amount, v_box.price_fxu);

-- Reparto empresa/pool/referido del costo
PERFORM distribute_spend_fee(v_box.price_fxu, 'supply_box', 'supply_box',
  v_user_id, 'Compra: ' || v_box.name, NULL);

RETURN jsonb_build_object(
'success', true,
'message', 'Caja comprada! Recursos agregados a ' || v_planet.name,
'metal', v_box.metal_amount,
'crystal', v_box.crystal_amount,
'deuterium', v_box.deuterium_amount,
'fxu_spent', v_box.price_fxu,
'storage_limited', false
);
END;
$function$;

-- 4.7) Cosmeticos (antes solo ledger, sin wallet/pool/referido)
CREATE OR REPLACE FUNCTION public.purchase_cosmetic(p_cosmetic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_item cosmetic_items%ROWTYPE;
  v_balance numeric;
  v_expires timestamptz;
  v_purchase_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_item FROM cosmetic_items WHERE id = p_cosmetic_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cosmetico no encontrado');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_balance FROM profiles WHERE id = v_user_id;
  IF v_balance < v_item.fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_item.fxu_cost || ' FXU, tienes ' || FLOOR(v_balance));
  END IF;

  -- Ya tiene este cosmetico activo? renovar en vez de duplicar
  UPDATE user_cosmetics
  SET expires_at = expires_at + (v_item.duration_days || ' days')::interval
  WHERE user_id = v_user_id AND cosmetic_id = p_cosmetic_id AND expires_at > now() AND equipped = true
  RETURNING id INTO v_purchase_id;

  IF FOUND THEN
    PERFORM _internal_set_fxu_context();
    UPDATE profiles SET fxu_balance = fxu_balance - v_item.fxu_cost WHERE id = v_user_id;
    PERFORM distribute_spend_fee(v_item.fxu_cost, 'cosmetic', 'other', v_user_id, 'Renew: ' || v_item.name_es, NULL);
    RETURN jsonb_build_object('success', true, 'message', 'Renovado hasta ' || (v_expires + (v_item.duration_days || ' days')::interval)::text, 'cost', v_item.fxu_cost, 'renewal', true);
  END IF;

  -- Nueva compra
  v_expires := now() + (v_item.duration_days || ' days')::interval;

  -- Cobrar
  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_item.fxu_cost WHERE id = v_user_id;
  PERFORM distribute_spend_fee(v_item.fxu_cost, 'cosmetic', 'other', v_user_id, 'Purchase: ' || v_item.name_es, NULL);

  INSERT INTO user_cosmetics (user_id, cosmetic_id, purchased_at, expires_at, equipped)
  VALUES (v_user_id, p_cosmetic_id, now(), v_expires, false)
  RETURNING id INTO v_purchase_id;

  RETURN jsonb_build_object('success', true, 'message', v_item.name_es || ' adquirido!', 'expires_at', v_expires, 'cost', v_item.fxu_cost);
END;
$function$;

-- 4.8) Fee de transferencia entre jugadores (antes 100% empresa)
CREATE OR REPLACE FUNCTION public.transfer_tokens(p_receiver_username text, p_token_type text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sender_id uuid;
  v_receiver_id uuid;
  v_receiver_username text;
  v_sender_username text;
  v_sender_balance numeric;
  v_fee_percent numeric;
  v_fee_amount numeric;
  v_net_amount numeric;
  v_transfers_enabled text;
  v_admin_id uuid;
  v_transfer_id uuid;
  v_input text;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT value INTO v_transfers_enabled FROM game_settings WHERE key = 'transfers_enabled';
  IF COALESCE(v_transfers_enabled, 'true') != 'true' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfers are currently disabled');
  END IF;

  IF p_token_type != 'TUNG' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token type');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than 0');
  END IF;

  IF p_amount < 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum transfer is 1,000');
  END IF;

  SELECT username INTO v_sender_username FROM profiles WHERE id = v_sender_id;

  v_input := TRIM(p_receiver_username);

  IF v_input LIKE '%@%' THEN
    SELECT id, username INTO v_receiver_id, v_receiver_username
    FROM profiles
    WHERE LOWER(email) = LOWER(v_input);
    IF v_receiver_id IS NULL THEN
      SELECT id, username INTO v_receiver_id, v_receiver_username
      FROM profiles
      WHERE LOWER(username) = LOWER(v_input);
    END IF;
  ELSE
    SELECT id, username INTO v_receiver_id, v_receiver_username
    FROM profiles
    WHERE LOWER(username) = LOWER(v_input);
    IF v_receiver_id IS NULL THEN
      SELECT id, username INTO v_receiver_id, v_receiver_username
      FROM profiles
      WHERE LOWER(email) = LOWER(v_input);
    END IF;
  END IF;

  IF v_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found. Check the username or email.');
  END IF;

  IF v_receiver_id = v_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  SELECT value INTO v_fee_percent FROM game_settings WHERE key = 'transfer_fee_percent';
  v_fee_percent := COALESCE(v_fee_percent::numeric, 10);

  v_fee_amount := FLOOR(p_amount * v_fee_percent / 100 * 100000000) / 100000000;
  v_net_amount := p_amount - v_fee_amount;

  IF v_net_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount too small after fee');
  END IF;

  SELECT fxu_balance INTO v_sender_balance FROM profiles WHERE id = v_sender_id;

  IF v_sender_balance IS NULL OR v_sender_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'available', COALESCE(v_sender_balance, 0), 'required', p_amount);
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  -- Descuenta al emisor y acredita el neto al receptor; el fee se reparte abajo
  UPDATE profiles SET fxu_balance = fxu_balance - p_amount WHERE id = v_sender_id;
  UPDATE profiles SET fxu_balance = fxu_balance + v_net_amount WHERE id = v_receiver_id;

  INSERT INTO internal_transfers (sender_id, receiver_id, token_type, gross_amount, fee_amount, net_amount, fee_percent)
  VALUES (v_sender_id, v_receiver_id, p_token_type, p_amount, v_fee_amount, v_net_amount, v_fee_percent)
  RETURNING id INTO v_transfer_id;

  -- Reparto empresa/pool/referido del fee de transferencia
  IF v_fee_amount > 0 THEN
    PERFORM distribute_spend_fee(v_fee_amount, 'transfer_fee', 'transfer_fee',
      v_sender_id, 'Transfer fee de ' || v_sender_username || ' a ' || v_receiver_username, v_transfer_id);
  END IF;

  INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
  VALUES (v_receiver_id, v_sender_id, 'Transfer received', 'You received ' || v_net_amount || ' ' || p_token_type || ' from ' || v_sender_username, 'system');

  RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id, 'gross_amount', p_amount, 'fee_amount', v_fee_amount, 'net_amount', v_net_amount, 'fee_percent', v_fee_percent, 'receiver', v_receiver_username, 'token_type', p_token_type);
END;
$function$;
