-- [HEROKIT1] Nave Heroe: se eliminan los kits de reparacion.
-- * Ya no salen en expediciones ni se pueden usar / vender; se ocultan del inventario.
-- * buy_hero_repair_kit ahora repara AL INSTANTE pagando TUNG (mismos precios hero_repair_kit_price_*).
-- * La reparacion en hangar y la auto-reparacion (HEROREGEN1) no cambian.

-- 1) Expediciones: probabilidad de kits = 0
DO $mig$
DECLARE
  v_src text;
  v_old text := '  v_kit_75_prob := COALESCE(v_kit_75_prob, 8); v_kit_100_prob := COALESCE(v_kit_100_prob, 3);';
BEGIN
  SELECT replace(pg_get_functiondef('public.claim_hero_expedition(uuid)'::regprocedure), chr(13), '') INTO v_src;
  IF position('[HEROKIT1]' in v_src) > 0 THEN
    RAISE NOTICE 'claim_hero_expedition ya parcheado';
  ELSE
    IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'HEROKIT1: ancla no encontrada en claim_hero_expedition';
    END IF;
    EXECUTE replace(v_src, v_old, v_old || E'\n  -- [HEROKIT1] kits de reparacion eliminados del botin\n  v_kit_25_prob := 0; v_kit_50_prob := 0; v_kit_75_prob := 0; v_kit_100_prob := 0;');
  END IF;
END
$mig$;

-- 2) Uso de kits deshabilitado + sin acceso para jugadores
DO $mig$
DECLARE
  v_src text;
  v_old text := '  PERFORM create_hero_ship(p_user_id);';
BEGIN
  SELECT replace(pg_get_functiondef('public.use_hero_repair_kit(uuid,uuid)'::regprocedure), chr(13), '') INTO v_src;
  IF position('[HEROKIT1]' in v_src) > 0 THEN
    RAISE NOTICE 'use_hero_repair_kit ya parcheado';
  ELSE
    IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'HEROKIT1: ancla no encontrada en use_hero_repair_kit';
    END IF;
    EXECUTE replace(v_src, v_old,
      E'  -- [HEROKIT1] kits eliminados\n  RETURN jsonb_build_object(''success'', false, ''error'', ''Los kits de reparacion ya no estan disponibles. Repara con TUNG o espera la auto-reparacion.'');\n' || v_old);
  END IF;
END
$mig$;
REVOKE EXECUTE ON FUNCTION public.use_hero_repair_kit(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3) Inventario: ocultar kits
DO $mig$
DECLARE
  v_src text;
  v_old text := '  WHERE inv.user_id = p_user_id AND inv.quantity > 0;';
BEGIN
  SELECT replace(pg_get_functiondef('public.get_hero_inventory(uuid)'::regprocedure), chr(13), '') INTO v_src;
  IF position('[HEROKIT1]' in v_src) > 0 THEN
    RAISE NOTICE 'get_hero_inventory ya parcheado';
  ELSE
    IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'HEROKIT1: ancla no encontrada en get_hero_inventory';
    END IF;
    EXECUTE replace(v_src, v_old,
      '  WHERE inv.user_id = p_user_id AND inv.quantity > 0 AND NOT COALESCE(i.is_repair_kit, false); -- [HEROKIT1]');
  END IF;
END
$mig$;

-- 4) Mercado P2P: no se pueden publicar kits
DO $mig$
DECLARE
  v_src text;
  v_old text := '  IF p_quantity < 1 OR p_price_fxu < 1 THEN';
BEGIN
  SELECT replace(pg_get_functiondef('public.create_hero_item_listing(uuid,integer,integer,bigint)'::regprocedure), chr(13), '') INTO v_src;
  IF position('[HEROKIT1]' in v_src) > 0 THEN
    RAISE NOTICE 'create_hero_item_listing ya parcheado';
  ELSE
    IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'HEROKIT1: ancla no encontrada en create_hero_item_listing';
    END IF;
    EXECUTE replace(v_src, v_old,
      E'  -- [HEROKIT1] kits eliminados\n  IF EXISTS (SELECT 1 FROM hero_ship_items WHERE id = p_item_id AND is_repair_kit) THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''Los kits de reparacion ya no se pueden vender'');\n  END IF;\n\n' || v_old);
  END IF;
END
$mig$;

-- 5) Reparacion instantanea pagando TUNG (reemplaza la compra de kits)
CREATE OR REPLACE FUNCTION public.buy_hero_repair_kit(p_user_id uuid, p_kit_pct integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price numeric;
  v_ship record;
  v_balance numeric;
  v_repair integer;
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

  -- [HEROKIT1] Reparacion directa con TUNG (sin kits)
  IF p_kit_pct NOT IN (25, 50, 75, 100) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reparacion no disponible');
  END IF;

  SELECT value::numeric INTO v_price
  FROM game_settings
  WHERE key = 'hero_repair_kit_price_' || p_kit_pct;

  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reparacion no disponible');
  END IF;

  PERFORM public.create_hero_ship(p_user_id);
  PERFORM public.apply_hero_regen(p_user_id);

  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nave no encontrada');
  END IF;

  IF EXISTS (SELECT 1 FROM hero_ship_active_expedition WHERE user_id = p_user_id AND claimed = false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes reparar mientras la nave esta en expedicion');
  END IF;

  IF v_ship.repair_until IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya hay una reparacion en hangar en curso');
  END IF;

  IF v_ship.hp >= v_ship.hp_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu nave ya esta al maximo de HP');
  END IF;

  SELECT fxu_balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  IF COALESCE(v_balance, 0) < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'TUNG insuficiente. Necesitas: ' || v_price || ' TUNG');
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_price WHERE id = p_user_id;
  PERFORM record_admin_revenue('hero_kit_sale', v_price, 'Hero TUNG repair ' || p_kit_pct || '%', NULL, NULL);

  v_repair := LEAST(v_ship.hp_max - v_ship.hp, FLOOR(v_ship.hp_max * p_kit_pct / 100.0))::integer;
  UPDATE user_hero_ships SET hp = hp + v_repair, updated_at = now() WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Nave reparada +' || v_repair || ' HP',
    'hp_repaired', v_repair,
    'hp_current', v_ship.hp + v_repair
  );
END;
$function$;
