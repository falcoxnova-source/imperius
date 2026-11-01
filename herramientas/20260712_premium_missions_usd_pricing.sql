-- =============================================================
-- Misiones Premium con precio en USD (cobrado en TUNG)
-- El admin fija un valor en USD por mision. El costo en TUNG se
-- calcula dinamicamente al precio de mercado: TUNG = USD / precio_tung
-- =============================================================

BEGIN;

-- 1) Nueva columna de precio en USD (nullable => legacy usa cost_fxu)
ALTER TABLE public.daily_missions
  ADD COLUMN IF NOT EXISTS cost_usd numeric;

-- 2) Precios USD por defecto para las misiones premium existentes
--    (tiers segun duracion del bono). El admin los puede editar luego.
UPDATE public.daily_missions SET cost_usd = 1.00 WHERE id = 16; -- 24h  +9% velocidad
UPDATE public.daily_missions SET cost_usd = 1.50 WHERE id = 14; -- 36h  +7% velocidad
UPDATE public.daily_missions SET cost_usd = 2.00 WHERE id = 15; -- 48h  +10% produccion
UPDATE public.daily_missions SET cost_usd = 2.00 WHERE id = 17; -- 48h  +5% velocidad
UPDATE public.daily_missions SET cost_usd = 3.00 WHERE id = 13; -- 72h  +6% produccion

-- =============================================================
-- 3) get_premium_missions(): devuelve el costo en TUNG calculado a
--    partir del precio USD y el precio de mercado actual.
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_premium_missions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_price  numeric;
BEGIN
  v_price := get_live_tung_price_usd();

  SELECT COALESCE(jsonb_agg(x ORDER BY x_sort ASC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'id', dm.id,
        'code', dm.code,
        'title_es', dm.title_es,
        'description_es', dm.desc_es,
        'mission_type', dm.mission_type,
        'target_count', dm.target_count,
        'reward_type', dm.reward_type,
        'reward_value', dm.reward_value,
        'reward_duration_hours', dm.reward_duration_hours,
        'cost_usd', dm.cost_usd,
        -- Costo en TUNG: si hay precio USD y precio de mercado, se calcula;
        -- si no, cae al cost_fxu fijo (legacy).
        'cost_fxu', CASE
          WHEN dm.cost_usd IS NOT NULL AND dm.cost_usd > 0 AND v_price IS NOT NULL AND v_price > 0
            THEN ceil(dm.cost_usd / v_price)::bigint
          ELSE dm.cost_fxu
        END,
        'tung_price_usd', v_price,
        'icon', dm.icon,
        'is_active', dm.is_active
      ) AS x,
      COALESCE(dm.cost_usd, dm.cost_fxu::numeric) AS x_sort
    FROM daily_missions dm
    WHERE dm.is_active = true
      AND (dm.cost_fxu > 0 OR (dm.cost_usd IS NOT NULL AND dm.cost_usd > 0))
  ) s;

  RETURN v_result;
END;
$function$;

-- =============================================================
-- 4) purchase_daily_mission_bonus(): cobra el costo en TUNG calculado
--    dinamicamente desde el precio USD (o cost_fxu legacy).
-- =============================================================
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

-- =============================================================
-- 5) Admin: leer precios de misiones premium
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_get_premium_missions_pricing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_price numeric;
BEGIN
  IF NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_price := get_live_tung_price_usd();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', dm.id,
    'code', dm.code,
    'title_es', dm.title_es,
    'reward_type', dm.reward_type,
    'reward_value', dm.reward_value,
    'reward_duration_hours', dm.reward_duration_hours,
    'cost_usd', dm.cost_usd,
    'cost_fxu', dm.cost_fxu,
    'computed_tung', CASE
      WHEN dm.cost_usd IS NOT NULL AND dm.cost_usd > 0 AND v_price IS NOT NULL AND v_price > 0
        THEN ceil(dm.cost_usd / v_price)::bigint
      ELSE NULL
    END,
    'is_active', dm.is_active
  ) ORDER BY dm.id ASC), '[]'::jsonb) INTO v_result
  FROM daily_missions dm
  WHERE dm.cost_fxu > 0 OR (dm.cost_usd IS NOT NULL AND dm.cost_usd > 0)
     OR dm.code LIKE 'premium\_%';

  RETURN jsonb_build_object('success', true, 'tung_price_usd', v_price, 'missions', v_result);
END;
$function$;

-- =============================================================
-- 6) Admin: actualizar el precio USD de una mision premium
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_update_premium_mission_price(p_mission_id integer, p_cost_usd numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_cost_usd IS NULL OR p_cost_usd < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El precio en USD debe ser 0 o mayor');
  END IF;

  UPDATE daily_missions
  SET cost_usd = p_cost_usd
  WHERE id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mision no encontrada');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_get_premium_missions_pricing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_premium_mission_price(integer, numeric) TO authenticated;

COMMIT;
