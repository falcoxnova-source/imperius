-- [HEROTUNG1] Reparacion de Nave Heroe SOLO en hangar pagando TUNG (monto fijo en USD -> TUNG al precio vivo).
-- Se elimina el pago con metal/cristal y la reparacion instantanea con TUNG (+25/50/75/100%).
-- Sigue existiendo la auto-reparacion lenta (min 7 dias).

INSERT INTO public.game_settings (key, value, description)
VALUES ('hero_repair_cost_usd', '1', 'Costo en USD (cobrado en TUNG) de reparar la Nave Heroe en hangar')
ON CONFLICT (key) DO NOTHING;

-- Costo en TUNG (interno). NULL si no hay precio vivo de TUNG.
CREATE OR REPLACE FUNCTION public._hero_repair_tung_cost()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usd numeric;
  v_price numeric;
BEGIN
  SELECT NULLIF(value, '')::numeric INTO v_usd FROM game_settings WHERE key = 'hero_repair_cost_usd';
  v_price := get_live_tung_price_usd();
  IF v_usd IS NULL OR v_usd <= 0 OR v_price IS NULL OR v_price <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN GREATEST(1, CEIL(v_usd / v_price))::integer;
END;
$function$;
REVOKE ALL ON FUNCTION public._hero_repair_tung_cost() FROM PUBLIC, anon, authenticated, service_role;

-- Reparacion en hangar: cobra TUNG (antes metal + cristal). Mismo tiempo de reparacion.
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

  -- [HEROTUNG1] costo fijo en USD cobrado en TUNG
  v_cost := public._hero_repair_tung_cost();
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
  PERFORM record_admin_revenue('hero_kit_sale', v_cost, 'Hero hangar repair (TUNG)', NULL, NULL);

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

-- Reparacion instantanea con TUNG eliminada: deshabilitada y sin acceso de clientes.
CREATE OR REPLACE FUNCTION public.buy_hero_repair_kit(p_user_id uuid, p_kit_pct integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- [HEROTUNG1] deshabilitada: solo reparacion en hangar con TUNG
  RETURN jsonb_build_object('success', false, 'error', 'Reparacion instantanea no disponible. Repara en hangar con TUNG.');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.buy_hero_repair_kit(uuid, integer) FROM PUBLIC, anon, authenticated;

-- get_hero_ship: expone costo TUNG/USD de hangar (metal/cristal ya no se cobran)
DO $mig$
DECLARE
  v_src text;
  v_anchor text := E'    ''hangar_metal_cost'', v_hangar_metal,\n    ''hangar_crystal_cost'', v_hangar_cristal,\n';
  v_new text := E'    -- [HEROTUNG1] reparacion en hangar solo con TUNG\n    ''hangar_tung_cost'', public._hero_repair_tung_cost(),\n    ''hangar_usd_cost'', (SELECT NULLIF(value, '''')::numeric FROM game_settings WHERE key = ''hero_repair_cost_usd''),\n    ''hangar_metal_cost'', 0,\n    ''hangar_crystal_cost'', 0,\n';
  v_count integer;
BEGIN
  v_src := replace(pg_get_functiondef('public.get_hero_ship(uuid)'::regprocedure), chr(13), '');
  IF position('[HEROTUNG1]' in v_src) > 0 THEN
    RETURN;
  END IF;
  v_count := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'get_hero_ship anchor count = %', v_count;
  END IF;
  EXECUTE replace(v_src, v_anchor, v_new);
END
$mig$;

-- Admin: editar el costo USD (solo admins)
CREATE OR REPLACE FUNCTION public.admin_update_hero_repair_cost_usd(p_usd numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF p_usd IS NULL OR p_usd <= 0 OR p_usd > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto USD invalido');
  END IF;
  INSERT INTO game_settings (key, value, description)
  VALUES ('hero_repair_cost_usd', p_usd::text, 'Costo en USD (cobrado en TUNG) de reparar la Nave Heroe en hangar')
  ON CONFLICT (key) DO UPDATE SET value = p_usd::text;
  RETURN jsonb_build_object('success', true, 'usd', p_usd);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_hero_repair_cost_usd(numeric) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_hero_repair_cost_usd(numeric) TO authenticated;
