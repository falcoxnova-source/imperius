-- [HEROTUNG2] Reparacion en hangar: costo proporcional al dano (hero_repair_cost_usd = 100% HP)
-- y el fee se reparte con distribute_spend_fee (50% pool / 50% empresa; referido 20% de empresa
-- o al pool si no hay referido; accionistas sobre la parte empresa via record_admin_revenue).

CREATE OR REPLACE FUNCTION public._hero_repair_tung_cost(p_hp integer, p_hp_max integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usd numeric;
  v_price numeric;
  v_missing integer;
BEGIN
  v_missing := GREATEST(COALESCE(p_hp_max, 0) - COALESCE(p_hp, 0), 0);
  IF v_missing = 0 OR COALESCE(p_hp_max, 0) <= 0 THEN
    RETURN 0;
  END IF;
  SELECT NULLIF(value, '')::numeric INTO v_usd FROM game_settings WHERE key = 'hero_repair_cost_usd';
  v_price := get_live_tung_price_usd();
  IF v_usd IS NULL OR v_usd <= 0 OR v_price IS NULL OR v_price <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN GREATEST(1, CEIL((v_usd * v_missing / p_hp_max) / v_price))::integer;
END;
$function$;
REVOKE ALL ON FUNCTION public._hero_repair_tung_cost(integer, integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.repair_hero_ship_in_hangar(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ship record;
  v_shipyard_level integer; v_robotics_level integer; v_nanite_level integer;
  v_edificios integer;
  v_hp_faltante integer;
  v_tiempo_base integer; v_multiplicador numeric; v_tiempo_final integer;
  v_cost integer;
  v_balance numeric;
  v_until timestamptz;
BEGIN

  -- [HEROAUDIT1] SEC005: impide operar en nombre de otra cuenta
  IF current_setting('role', true) IN ('authenticated', 'anon')
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado: solo puedes operar sobre tu propia cuenta. Code: SEC005'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public._hero_has_access(p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Nave Heroe aun no esta disponible para tu cuenta');
  END IF;

  IF public._hero_casino_state(p_user_id) <> 'hangar' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe esta en el Casino Galactico o viajando. Haz que regrese al hangar primero.');
  END IF;
  PERFORM create_hero_ship(p_user_id);
  PERFORM apply_hero_regen(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  IF v_ship.hp >= v_ship.hp_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'La nave ya esta al maximo de HP');
  END IF;

  IF EXISTS (SELECT 1 FROM hero_ship_active_expedition WHERE user_id = p_user_id AND claimed = false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes reparar mientras la nave esta en expedicion');
  END IF;

  IF v_ship.repair_until IS NOT NULL AND now() < v_ship.repair_until THEN
    RETURN jsonb_build_object('success', false, 'error', 'La nave ya esta siendo reparada en el hangar');
  END IF;

  -- [HEROTUNG2] costo USD proporcional al dano, cobrado en TUNG
  v_cost := public._hero_repair_tung_cost(v_ship.hp, v_ship.hp_max);
  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio de TUNG no disponible en este momento. Intenta mas tarde.');
  END IF;

  SELECT COALESCE(MAX(CASE WHEN bt.code = 'shipyard' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'robotics_factory' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'nanite_factory' THEN pb.level END), 0)
  INTO v_shipyard_level, v_robotics_level, v_nanite_level
  FROM planets p
  JOIN planet_buildings pb ON pb.planet_id = p.id
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE p.user_id = p_user_id AND p.is_main_planet = true;

  v_edificios := v_shipyard_level + v_robotics_level + v_nanite_level;
  v_hp_faltante := v_ship.hp_max - v_ship.hp;
  v_tiempo_base := CEIL(v_hp_faltante * 0.2);
  v_multiplicador := POWER(0.96, v_edificios);
  v_tiempo_final := GREATEST(1, CEIL(v_tiempo_base * v_multiplicador));

  SELECT fxu_balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;
  IF COALESCE(v_balance, 0) < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficiente. Necesitas: ' || v_cost || ' TUNG');
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_cost WHERE id = p_user_id;
  -- 50% pool / 50% empresa (referido 20% de empresa, accionistas sobre empresa)
  PERFORM distribute_spend_fee(v_cost, 'hero_repair', 'hero_kit_sale', p_user_id, 'Reparacion Nave Heroe en hangar', NULL);

  v_until := now() + (v_tiempo_final || ' minutes')::interval;
  UPDATE user_hero_ships SET
    repair_until = v_until,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'tung_cost', v_cost,
    'repair_minutes', v_tiempo_final,
    'repair_until', v_until::text
  );
END;
$function$;

DO $mig$
DECLARE
  v_src text;
  v_anchor text := E'    ''hangar_tung_cost'', public._hero_repair_tung_cost(),\n    ''hangar_usd_cost'', (SELECT NULLIF(value, '''')::numeric FROM game_settings WHERE key = ''hero_repair_cost_usd''),\n';
  v_new text := E'    -- [HEROTUNG2] costo proporcional al dano\n    ''hangar_tung_cost'', public._hero_repair_tung_cost(v_ship.hp, v_ship.hp_max),\n    ''hangar_usd_cost'', ROUND(COALESCE((SELECT NULLIF(value, '''')::numeric FROM game_settings WHERE key = ''hero_repair_cost_usd''), 0) * GREATEST(v_ship.hp_max - v_ship.hp, 0) / GREATEST(v_ship.hp_max, 1), 2),\n';
  v_count integer;
BEGIN
  v_src := replace(pg_get_functiondef('public.get_hero_ship(uuid)'::regprocedure), chr(13), '');
  IF position('[HEROTUNG2]' in v_src) > 0 THEN
    RETURN;
  END IF;
  v_count := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'get_hero_ship anchor count = %', v_count;
  END IF;
  EXECUTE replace(v_src, v_anchor, v_new);
END
$mig$;

DROP FUNCTION IF EXISTS public._hero_repair_tung_cost();

UPDATE public.game_settings
SET description = 'Costo en USD (cobrado en TUNG) de reparar el 100% de HP de la Nave Heroe en hangar; se cobra proporcional al dano'
WHERE key = 'hero_repair_cost_usd';
