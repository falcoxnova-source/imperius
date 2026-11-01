-- [HEROAUDIT1] Nave Heroe: auditoria de logica de negocio
-- 1) Funciones que vivian solo en schema auth (inaccesibles via PostgREST) -> copia en public con guard SEC005 + acceso
-- 2) claim_hero_expedition fallaba (add_hero_xp no existia en public) -> ahora da XP y sube nivel
-- 3) Duelos: poder incluye items, XP con subida de nivel, resolve via RPC seguro, resolved_at
-- 4) Coherencia de ubicacion (casino / expedicion / duelo)
-- 5) Tiempo de vuelo al Casino segun distancia + propulsor hiperespacial + velocidad de nave + almirante + bonus diario + Plus
-- 6) Cierre de RPCs/tablas abiertas

CREATE FUNCTION pg_temp.hx_patch(p_fn regprocedure, p_anchor text, p_ins text,
                                 p_to_public boolean DEFAULT false, p_before boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $hx$
DECLARE d text; k int;
BEGIN
  d := replace(pg_get_functiondef(p_fn), E'\r', '');
  IF p_to_public THEN
    IF position('CREATE OR REPLACE FUNCTION auth.' in d) = 0 THEN
      RAISE EXCEPTION 'HEROAUDIT1: % no es de schema auth', p_fn;
    END IF;
    d := replace(d, 'CREATE OR REPLACE FUNCTION auth.', 'CREATE OR REPLACE FUNCTION public.');
  END IF;
  IF p_anchor IS NOT NULL THEN
    k := position(p_anchor in d);
    IF k = 0 THEN RAISE EXCEPTION 'HEROAUDIT1: anchor no encontrado en %: %', p_fn, p_anchor; END IF;
    IF position(p_anchor in substr(d, k + 1)) > 0 THEN RAISE EXCEPTION 'HEROAUDIT1: anchor no unico en %', p_fn; END IF;
    IF p_before THEN
      d := overlay(d placing p_ins || p_anchor from k for length(p_anchor));
    ELSE
      d := overlay(d placing p_anchor || p_ins from k for length(p_anchor));
    END IF;
  END IF;
  EXECUTE d;
END
$hx$;

-- ---------------------------------------------------------------
-- Helper: bonus de items equipados (misma formula que get_hero_ship)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._hero_item_bonus(p_user_id uuid, p_stat text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(FLOOR(
           CASE p_stat
             WHEN 'attack'  THEN i.attack_bonus
             WHEN 'defense' THEN i.defense_bonus
             WHEN 'shield'  THEN i.shield_bonus
             WHEN 'speed'   THEN i.speed_bonus
             WHEN 'loot'    THEN i.loot_bonus
           END * x.lvl)), 0)::integer
  FROM public.user_hero_ships s
  CROSS JOIN LATERAL (VALUES (s.weapon_slot,  s.weapon_item_level),
                             (s.shield_slot,  s.shield_item_level),
                             (s.module_slot,  s.module_item_level),
                             (s.reactor_slot, s.reactor_item_level)) AS x(item_id, lvl)
  JOIN public.hero_ship_items i ON i.id = x.item_id
  WHERE s.user_id = p_user_id;
$function$;

-- ---------------------------------------------------------------
-- 1) Copias auth -> public
-- ---------------------------------------------------------------
SELECT pg_temp.hx_patch('auth.hero_xp_for_level(integer)'::regprocedure, NULL, NULL, true);
SELECT pg_temp.hx_patch('auth.add_hero_xp(uuid,integer)'::regprocedure, NULL, NULL, true);
SELECT pg_temp.hx_patch('auth.apply_hero_regen(uuid)'::regprocedure, NULL, NULL, true);

DO $do$
DECLARE
  g_guard text := $g$
  -- [HEROAUDIT1] SEC005: impide operar en nombre de otra cuenta
  IF current_setting('role', true) IN ('authenticated', 'anon')
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado: solo puedes operar sobre tu propia cuenta. Code: SEC005'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
$g$;
  g_access text := $g$
  IF NOT public._hero_has_access(p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Nave Heroe aun no esta disponible para tu cuenta');
  END IF;
$g$;
  g_hangar text := $g$
  IF public._hero_casino_state(p_user_id) <> 'hangar' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe esta en el Casino Galactico o viajando. Haz que regrese al hangar primero.');
  END IF;
$g$;
  g_noduel text := $g$
  IF EXISTS (SELECT 1 FROM public.hero_duels WHERE (creator_id = p_user_id OR opponent_id = p_user_id) AND status = 'accepted') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes cambiar el equipo con un duelo en curso');
  END IF;
$g$;
BEGIN
  PERFORM pg_temp.hx_patch('auth.get_hero_ship(uuid)'::regprocedure, E'\nBEGIN\n', g_guard, true, false);
  PERFORM pg_temp.hx_patch('auth.assign_hero_points(uuid,integer,integer,integer,integer)'::regprocedure, E'\nBEGIN\n', g_guard || g_access, true, false);
  PERFORM pg_temp.hx_patch('auth.respec_hero_ship(uuid)'::regprocedure, E'\nBEGIN\n', g_guard || g_access, true, false);
  PERFORM pg_temp.hx_patch('auth.equip_hero_item(uuid,uuid)'::regprocedure, E'\nBEGIN\n', g_guard || g_access || g_hangar || g_noduel, true, false);
  PERFORM pg_temp.hx_patch('auth.unequip_hero_item(uuid,text)'::regprocedure, E'\nBEGIN\n', g_guard || g_access || g_hangar || g_noduel, true, false);
  PERFORM pg_temp.hx_patch('auth.repair_hero_ship_in_hangar(uuid)'::regprocedure, E'\nBEGIN\n', g_guard || g_access || g_hangar, true, false);
  PERFORM pg_temp.hx_patch('auth.buy_hero_repair_kit(uuid,integer)'::regprocedure, E'\nBEGIN\n', g_guard || g_access, true, false);
  -- Listings usan auth.uid() internamente
  PERFORM pg_temp.hx_patch('auth.create_hero_item_listing(uuid,integer,integer,bigint)'::regprocedure,
    E'  IF p_quantity < 1 OR p_price_fxu < 1 THEN',
    E'  IF NOT public._hero_has_access(v_user_id) THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''La Nave Heroe aun no esta disponible para tu cuenta'');\n  END IF;\n\n',
    true, true);
  PERFORM pg_temp.hx_patch('auth.cancel_hero_item_listing(uuid)'::regprocedure, NULL, NULL, true);

  -- ---------------------------------------------------------------
  -- 2) Expedicion: acceso + no salir con duelo pendiente
  -- ---------------------------------------------------------------
  PERFORM pg_temp.hx_patch('public.start_hero_expedition(uuid,uuid)'::regprocedure,
    E'  PERFORM create_hero_ship(p_user_id);\n',
    g_access || $g$
  IF EXISTS (SELECT 1 FROM public.hero_duels WHERE (creator_id = p_user_id OR opponent_id = p_user_id) AND status IN ('waiting', 'accepted')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tienes un duelo activo. Cancelalo o espera a que termine antes de salir de expedicion.');
  END IF;
$g$, false, true);

  -- ---------------------------------------------------------------
  -- 3) Lecturas con IDOR
  -- ---------------------------------------------------------------
  PERFORM pg_temp.hx_patch('public.get_hero_inventory(uuid)'::regprocedure, E'\nBEGIN\n', g_guard, false, false);
  PERFORM pg_temp.hx_patch('public.get_hero_active_expedition(uuid)'::regprocedure, E'\nBEGIN\n', g_guard, false, false);
  PERFORM pg_temp.hx_patch('public.get_hero_duel_history(uuid)'::regprocedure, E'\nBEGIN\n', g_guard, false, false);

  -- ---------------------------------------------------------------
  -- 4) Duelos: acceso + nave en hangar y sin expedicion
  -- ---------------------------------------------------------------
  PERFORM pg_temp.hx_patch('public.create_hero_duel(integer)'::regprocedure,
    E'  PERFORM create_hero_ship(v_user_id);\n', $g$
  IF NOT public._hero_has_access(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Nave Heroe aun no esta disponible para tu cuenta');
  END IF;
  IF public._hero_casino_state(v_user_id) <> 'hangar' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe esta en el Casino Galactico o viajando. Haz que regrese al hangar primero.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.hero_ship_active_expedition WHERE user_id = v_user_id AND claimed = false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe esta en una expedicion');
  END IF;
$g$, false, true);
  PERFORM pg_temp.hx_patch('public.accept_hero_duel(uuid)'::regprocedure,
    E'  PERFORM create_hero_ship(v_user_id);\n', $g$
  IF NOT public._hero_has_access(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Nave Heroe aun no esta disponible para tu cuenta');
  END IF;
  IF public._hero_casino_state(v_user_id) <> 'hangar' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe esta en el Casino Galactico o viajando. Haz que regrese al hangar primero.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.hero_ship_active_expedition WHERE user_id = v_user_id AND claimed = false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu Nave Heroe esta en una expedicion');
  END IF;
$g$, false, true);

  -- Casino: no viajar con duelo pendiente
  PERFORM pg_temp.hx_patch('public.hero_casino_travel()'::regprocedure,
    E'  DELETE FROM public.hero_casino_trips\n  WHERE user_id = v_uid AND returns_at IS NOT NULL', $g$
  IF EXISTS (SELECT 1 FROM public.hero_duels WHERE (creator_id = v_uid OR opponent_id = v_uid) AND status IN ('waiting', 'accepted')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tienes un duelo activo. Cancelalo o espera a que termine antes de viajar.');
  END IF;

$g$, false, true);
END
$do$;

-- resolve_hero_duel: poder con items, XP con subida de nivel, resolved_at
DO $do$
DECLARE d text; a text; b text;
  pairs text[][] := ARRAY[
    ARRAY['COALESCE(v_creator_ship.attack_points, 0) * 3',  '(COALESCE(v_creator_ship.attack_points, 0) + public._hero_item_bonus(v_duel.creator_id, ''attack'')) * 3'],
    ARRAY['COALESCE(v_creator_ship.defense_points, 0) * 2', '(COALESCE(v_creator_ship.defense_points, 0) + public._hero_item_bonus(v_duel.creator_id, ''defense'')) * 2'],
    ARRAY['COALESCE(v_creator_ship.shield_points, 0) * 1.5','(COALESCE(v_creator_ship.shield_points, 0) + public._hero_item_bonus(v_duel.creator_id, ''shield'')) * 1.5'],
    ARRAY['COALESCE(v_creator_ship.speed_points, 0) +',     '(COALESCE(v_creator_ship.speed_points, 0) + public._hero_item_bonus(v_duel.creator_id, ''speed'')) +'],
    ARRAY['COALESCE(v_opponent_ship.attack_points, 0) * 3', '(COALESCE(v_opponent_ship.attack_points, 0) + public._hero_item_bonus(v_duel.opponent_id, ''attack'')) * 3'],
    ARRAY['COALESCE(v_opponent_ship.defense_points, 0) * 2','(COALESCE(v_opponent_ship.defense_points, 0) + public._hero_item_bonus(v_duel.opponent_id, ''defense'')) * 2'],
    ARRAY['COALESCE(v_opponent_ship.shield_points, 0) * 1.5','(COALESCE(v_opponent_ship.shield_points, 0) + public._hero_item_bonus(v_duel.opponent_id, ''shield'')) * 1.5'],
    ARRAY['COALESCE(v_opponent_ship.speed_points, 0) +',    '(COALESCE(v_opponent_ship.speed_points, 0) + public._hero_item_bonus(v_duel.opponent_id, ''speed'')) +'],
    ARRAY['UPDATE user_hero_ships SET xp = xp + v_xp_gain, updated_at = now() WHERE user_id = v_winner_id;', 'PERFORM add_hero_xp(v_winner_id, v_xp_gain);'],
    ARRAY[E'    status = ''completed'',\n    winner_id = v_winner_id,', E'    status = ''completed'',\n    resolved_at = now(),\n    winner_id = v_winner_id,']
  ];
  i int;
BEGIN
  d := replace(pg_get_functiondef('public.resolve_hero_duel(uuid)'::regprocedure), E'\r', '');
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    a := pairs[i][1]; b := pairs[i][2];
    IF position(a in d) = 0 OR position(a in substr(d, position(a in d) + 1)) > 0 THEN
      RAISE EXCEPTION 'HEROAUDIT1: anchor resolve no unico/no encontrado: %', a;
    END IF;
    d := replace(d, a, b);
  END LOOP;
  EXECUTE d;
END
$do$;

-- RPC seguro para que un participante resuelva su duelo vencido
CREATE OR REPLACE FUNCTION public.resolve_my_hero_duel(p_duel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hero_duels WHERE id = p_duel_id AND (creator_id = v_uid OR opponent_id = v_uid)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duelo no encontrado');
  END IF;
  RETURN public.resolve_hero_duel(p_duel_id);
END;
$function$;

-- Vista: premio real del ganador (2*apuesta - comision 20%) + updated_at (la UI ordena por el)
CREATE OR REPLACE VIEW public.hero_duel_active_view AS
 SELECT hd.id,
    hd.creator_id,
    hd.opponent_id,
    hd.status,
    hd.stake,
    hd.winner_id,
    hd.resolves_at,
    hd.created_at,
    COALESCE(c.username, 'Unknown'::text) AS creator_username,
    COALESCE(o.username, 'Unknown'::text) AS opponent_username,
    hd.creator_level,
    hd.opponent_level,
        CASE
            WHEN (hd.winner_id IS NOT NULL) THEN ((hd.stake * 2) - (ceil((hd.stake)::numeric * 0.2))::integer)
            ELSE NULL::integer
        END AS winner_amount,
    hd.updated_at
   FROM ((hero_duels hd
     LEFT JOIN profiles c ON ((c.id = hd.creator_id)))
     LEFT JOIN profiles o ON ((o.id = hd.opponent_id)));

-- ---------------------------------------------------------------
-- 5) Mercado: datos que la UI necesita
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_hero_market_listings()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'listing_id', l.id, 'seller_id', l.seller_id, 'seller_name', COALESCE(p.username,'Unknown'),
    'item_id', l.item_id, 'item_name', i.name, 'description', i.description,
    'rarity', i.rarity, 'item_level', l.item_level,
    'quantity', l.quantity, 'price_fxu', l.price_fxu,
    'attack_bonus', i.attack_bonus, 'defense_bonus', i.defense_bonus,
    'shield_bonus', i.shield_bonus, 'speed_bonus', i.speed_bonus,
    'loot_bonus', i.loot_bonus, 'slot_type', i.slot_type
  ) ORDER BY l.created_at DESC), '[]'::jsonb) INTO v_result
  FROM hero_item_market_listings l
  JOIN hero_ship_items i ON i.id = l.item_id
  LEFT JOIN profiles p ON p.id = l.seller_id
  WHERE l.status = 'active';
  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------
-- 6) Tiempo de vuelo al Casino = logica de flota normal
--    velocidad = base * (1 + propulsor hiperespacial*30%) * (1 + velocidad total nave/100)
--    + almirante (0.2), bonus diario de misiones, Plus -10%
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._hero_casino_flight_seconds(p_user_id uuid, p_galaxy integer, p_system integer, p_position integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base integer;
  v_speed_total integer;
  v_hyper integer;
  v_speed integer;
  v_admiral numeric := 0;
  v_secs integer;
BEGIN
  SELECT NULLIF(regexp_replace(value, '[^0-9]', '', 'g'), '')::integer INTO v_base
  FROM public.game_settings WHERE key = 'hero_casino_base_speed';
  v_base := GREATEST(COALESCE(v_base, 10000), 1);

  SELECT GREATEST(COALESCE(speed_points, 0), 0) INTO v_speed_total
  FROM public.user_hero_ships WHERE user_id = p_user_id;
  v_speed_total := GREATEST(COALESCE(v_speed_total, 0) + public._hero_item_bonus(p_user_id, 'speed'), 0);

  SELECT COALESCE((SELECT ut.level FROM public.user_technologies ut
                   JOIN public.technology_types tt ON ut.technology_type_id = tt.id
                   WHERE ut.user_id = p_user_id AND tt.code = 'hyperspace_drive'), 0)
  INTO v_hyper;

  v_speed := GREATEST(1, ROUND(v_base * (1 + v_hyper * 0.30) * (100 + v_speed_total) / 100.0))::integer;

  IF public.has_active_officer(p_user_id, 'admiral') THEN
    v_admiral := 0.2;
  END IF;

  v_secs := public.fleet_calc_flight_time(
    public.fleet_calc_distance(p_galaxy, p_system, p_position, 3, 250, 10),
    v_speed, 100, v_admiral);

  v_secs := GREATEST(10, FLOOR(v_secs / (1 + COALESCE(public.get_user_daily_mission_speed_bonus(p_user_id), 0))))::integer;

  IF public.is_user_plus(p_user_id) THEN
    v_secs := GREATEST(10, FLOOR(v_secs * 0.90))::integer;
  END IF;

  RETURN GREATEST(1, v_secs);
END;
$function$;

-- ---------------------------------------------------------------
-- 7) Permisos
-- ---------------------------------------------------------------
REVOKE ALL ON FUNCTION public._hero_item_bonus(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hero_xp_for_level(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_hero_xp(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_hero_regen(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._hero_casino_flight_seconds(uuid,integer,integer,integer) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_hero_ship(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_hero_points(uuid,integer,integer,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respec_hero_ship(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equip_hero_item(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unequip_hero_item(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repair_hero_ship_in_hangar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buy_hero_repair_kit(uuid,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_hero_item_listing(uuid,integer,integer,bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_hero_item_listing(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_my_hero_duel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hero_ship(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_hero_points(uuid,integer,integer,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respec_hero_ship(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equip_hero_item(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unequip_hero_item(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repair_hero_ship_in_hangar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.buy_hero_repair_kit(uuid,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_hero_item_listing(uuid,integer,integer,bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_hero_item_listing(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_my_hero_duel(uuid) TO authenticated, service_role;

-- Funcion vieja (pago antiguo, sin XP) no usada por la UI
REVOKE ALL ON FUNCTION public.get_hero_duel_status(uuid) FROM PUBLIC, anon, authenticated;

-- Copias en auth: quedan sin ejecucion publica (no se borran)
REVOKE ALL ON FUNCTION auth.add_hero_xp(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.hero_xp_for_level(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.apply_hero_regen(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.assign_hero_points(uuid,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.buy_hero_repair_kit(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.cancel_hero_item_listing(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.create_hero_item_listing(uuid,integer,integer,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.equip_hero_item(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.get_hero_ship(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.repair_hero_ship_in_hangar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.respec_hero_ship(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.start_hero_expedition(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth.unequip_hero_item(uuid,text) FROM PUBLIC, anon, authenticated;

-- Tablas privadas: solo via RPC / vistas (las vistas son del owner y siguen funcionando)
REVOKE ALL ON TABLE public.user_hero_ships, public.user_hero_ship_inventory, public.hero_ship_active_expedition,
                    public.hero_item_market_listings, public.hero_market_pool, public.hero_duels
  FROM anon, authenticated;
REVOKE ALL ON TABLE public.hero_duel_active_view, public.hero_duel_history_view, public.hero_duel_offers_view,
                    public.hero_ship_ranking_view, public.hero_ship_items, public.hero_ship_expeditions
  FROM anon;
GRANT SELECT ON TABLE public.hero_duel_active_view TO authenticated;
