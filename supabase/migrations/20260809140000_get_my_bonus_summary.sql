-- ============================================================================
-- get_my_bonus_summary(): fuente unica de verdad para la UI de bonos activos.
--
-- Devuelve exactamente los mismos numeros que aplican las funciones de juego,
-- para que el panel de la interfaz NUNCA se desincronice del backend:
--   * produccion  -> calculate_planet_resources
--   * edificios   -> secure_add_to_building_queue      (apply_vip_time_bonus)
--   * astillero   -> secure_add_to_shipyard_queue      (apply_vip_time_bonus)
--   * investigacion -> secure_start_research           (Tecnocrata + VIP)
--   * flota       -> secure_send_fleet                 (Almirante + mision + VIP)
--
-- Los multiplicadores de tiempo son DIVISORES: tiempo_final = tiempo / mult.
-- `percent` es "cuanto mas rapido/mas produccion" en % para pintarlo directo.
--
-- NOTA: solo se reportan bonos que el backend aplica de verdad. El tipo
-- `construction_speed_bonus` de user_active_bonuses NO lo consume ninguna
-- funcion, asi que se omite a proposito (mostrarlo seria mentirle al jugador).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_bonus_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_now timestamptz := now();

  v_entries jsonb := '[]'::jsonb;

  v_is_plus boolean := false;
  v_vip_expires timestamptz;
  v_vip_time_mult numeric;
  v_vip_prod numeric;

  v_has_geologist boolean := false;  v_geologist_exp timestamptz;
  v_has_technocrat boolean := false; v_technocrat_exp timestamptz;
  v_has_admiral boolean := false;    v_admiral_exp timestamptz;
  v_has_engineer boolean := false;   v_engineer_exp timestamptz;
  v_has_commander boolean := false;  v_commander_exp timestamptz;

  v_streak_count integer;
  v_streak_exp timestamptz;

  v_mission_speed numeric := 0;   -- fraccion, solo flota

  v_prod_add numeric := 0;        -- parte aditiva (oficial + racha + misiones)
  v_prod_total numeric := 1;
  v_build numeric := 1;
  v_research numeric := 1;
  v_shipyard numeric := 1;
  v_fleet numeric := 1;

  r RECORD;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'not authenticated');
  END IF;

  v_vip_time_mult := COALESCE(get_vip_time_speed_multiplier(), 1);
  v_vip_prod := COALESCE(get_vip_production_bonus(), 0);

  SELECT MAX(expires_at) INTO v_vip_expires
  FROM plus_subscriptions
  WHERE user_id = v_user AND is_active = true AND expires_at > v_now;
  v_is_plus := v_vip_expires IS NOT NULL;

  FOR r IN
    SELECT ot.code, uo.expires_at
    FROM user_officers uo
    JOIN officer_types ot ON ot.id = uo.officer_type_id
    WHERE uo.user_id = v_user
      AND (uo.expires_at IS NULL OR uo.expires_at > v_now)
  LOOP
    CASE r.code
      WHEN 'geologist'  THEN v_has_geologist  := true; v_geologist_exp  := r.expires_at;
      WHEN 'technocrat' THEN v_has_technocrat := true; v_technocrat_exp := r.expires_at;
      WHEN 'admiral'    THEN v_has_admiral    := true; v_admiral_exp    := r.expires_at;
      WHEN 'engineer'   THEN v_has_engineer   := true; v_engineer_exp   := r.expires_at;
      WHEN 'commander'  THEN v_has_commander  := true; v_commander_exp  := r.expires_at;
      ELSE NULL;
    END CASE;
  END LOOP;

  SELECT streak_count, expires_at INTO v_streak_count, v_streak_exp
  FROM user_daily_streaks
  WHERE user_id = v_user AND expires_at > v_now
  LIMIT 1;

  v_mission_speed := COALESCE(get_user_daily_mission_speed_bonus(v_user), 0);

  -- ---------------------------------------------------------------- PRODUCCION
  IF v_has_geologist THEN
    v_prod_add := v_prod_add + 0.10;
    v_entries := v_entries || jsonb_build_object(
      'code', 'geologist', 'kind', 'production', 'percent', 10,
      'expires_at', v_geologist_exp, 'stack', 'add');
  END IF;

  IF v_streak_exp IS NOT NULL THEN
    v_prod_add := v_prod_add + 0.05;
    v_entries := v_entries || jsonb_build_object(
      'code', 'daily_streak', 'kind', 'production', 'percent', 5,
      'expires_at', v_streak_exp, 'stack', 'add',
      'meta', jsonb_build_object('streak', COALESCE(v_streak_count, 0)));
  END IF;

  FOR r IN
    SELECT uab.bonus_value, uab.expires_at, dm.title_es, dm.icon
    FROM user_active_bonuses uab
    LEFT JOIN daily_missions dm ON dm.id = uab.mission_id
    WHERE uab.user_id = v_user
      AND uab.bonus_type = 'production_bonus'
      AND uab.expires_at > v_now
    ORDER BY uab.expires_at ASC
  LOOP
    v_prod_add := v_prod_add + (r.bonus_value / 100.0);
    v_entries := v_entries || jsonb_build_object(
      'code', 'daily_mission', 'kind', 'production', 'percent', r.bonus_value,
      'expires_at', r.expires_at, 'stack', 'add',
      'title', r.title_es, 'icon', r.icon);
  END LOOP;

  IF v_is_plus AND v_vip_prod > 0 THEN
    v_entries := v_entries || jsonb_build_object(
      'code', 'vip', 'kind', 'production', 'percent', ROUND(v_vip_prod * 100, 2),
      'expires_at', v_vip_expires, 'stack', 'mult');
  END IF;

  v_prod_total := (1 + v_prod_add) * (CASE WHEN v_is_plus THEN 1 + v_vip_prod ELSE 1 END);

  -- ------------------------------------------------- EDIFICIOS / ASTILLERO
  IF v_is_plus AND v_vip_time_mult > 1 THEN
    v_build := v_build * v_vip_time_mult;
    v_shipyard := v_shipyard * v_vip_time_mult;
    v_entries := v_entries || jsonb_build_object(
      'code', 'vip', 'kind', 'build', 'percent', ROUND((v_vip_time_mult - 1) * 100, 2),
      'expires_at', v_vip_expires, 'stack', 'mult');
    v_entries := v_entries || jsonb_build_object(
      'code', 'vip', 'kind', 'shipyard', 'percent', ROUND((v_vip_time_mult - 1) * 100, 2),
      'expires_at', v_vip_expires, 'stack', 'mult');
  END IF;

  -- ------------------------------------------------------------ INVESTIGACION
  IF v_has_technocrat THEN
    v_research := v_research * (1 / 0.75);
    v_entries := v_entries || jsonb_build_object(
      'code', 'technocrat', 'kind', 'research', 'percent', ROUND((1 / 0.75 - 1) * 100, 2),
      'expires_at', v_technocrat_exp, 'stack', 'mult');
  END IF;
  IF v_is_plus AND v_vip_time_mult > 1 THEN
    v_research := v_research * v_vip_time_mult;
    v_entries := v_entries || jsonb_build_object(
      'code', 'vip', 'kind', 'research', 'percent', ROUND((v_vip_time_mult - 1) * 100, 2),
      'expires_at', v_vip_expires, 'stack', 'mult');
  END IF;

  -- -------------------------------------------------------------------- FLOTA
  IF v_has_admiral THEN
    v_fleet := v_fleet * 1.2;
    v_entries := v_entries || jsonb_build_object(
      'code', 'admiral', 'kind', 'fleet', 'percent', 20,
      'expires_at', v_admiral_exp, 'stack', 'mult');
  END IF;
  IF v_mission_speed > 0 THEN
    v_fleet := v_fleet * (1 + v_mission_speed);
    FOR r IN
      SELECT uab.bonus_value, uab.expires_at, dm.title_es, dm.icon
      FROM user_active_bonuses uab
      LEFT JOIN daily_missions dm ON dm.id = uab.mission_id
      WHERE uab.user_id = v_user
        AND uab.bonus_type = 'speed_bonus'
        AND uab.expires_at > v_now
      ORDER BY uab.expires_at ASC
    LOOP
      v_entries := v_entries || jsonb_build_object(
        'code', 'daily_mission', 'kind', 'fleet', 'percent', r.bonus_value,
        'expires_at', r.expires_at, 'stack', 'mult',
        'title', r.title_es, 'icon', r.icon);
    END LOOP;
  END IF;
  IF v_is_plus THEN
    v_fleet := v_fleet * (1 / 0.90);
    v_entries := v_entries || jsonb_build_object(
      'code', 'vip', 'kind', 'fleet', 'percent', ROUND((1 / 0.90 - 1) * 100, 2),
      'expires_at', v_vip_expires, 'stack', 'mult');
  END IF;

  -- --------------------------------------------------------- EXTRAS (no numericos)
  IF v_has_engineer THEN
    v_entries := v_entries || jsonb_build_object(
      'code', 'engineer', 'kind', 'energy', 'percent', 10,
      'expires_at', v_engineer_exp, 'stack', 'mult');
  END IF;
  IF v_has_commander THEN
    v_entries := v_entries || jsonb_build_object(
      'code', 'commander', 'kind', 'queue', 'percent', 0,
      'expires_at', v_commander_exp, 'stack', 'slots',
      'meta', jsonb_build_object('slots', 2));
  END IF;

  RETURN jsonb_build_object(
    'is_plus', v_is_plus,
    'vip_expires_at', v_vip_expires,
    'server_time', v_now,
    'totals', jsonb_build_object(
      'production', ROUND(v_prod_total, 4),
      'build',      ROUND(v_build, 4),
      'research',   ROUND(v_research, 4),
      'shipyard',   ROUND(v_shipyard, 4),
      'fleet',      ROUND(v_fleet, 4)
    ),
    'entries', v_entries
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_my_bonus_summary() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
