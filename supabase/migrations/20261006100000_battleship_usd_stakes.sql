-- [BATTLESHIP2] Apuestas de la Batalla Naval en USD, cobradas en TUNG al precio vivo.
-- min_stake / max_stake de battleship_config pasan a ser USD.
-- La sala fija el TUNG al crearla (stake) y guarda stake_usd + tung_price:
-- el rival paga EXACTAMENTE el mismo TUNG, aunque el precio cambie despues.
SET client_encoding TO 'UTF8';
SET lock_timeout = '5s';

BEGIN;

ALTER TABLE public.battleship_matches ADD COLUMN IF NOT EXISTS stake_usd  numeric;
ALTER TABLE public.battleship_matches ADD COLUMN IF NOT EXISTS tung_price numeric;

CREATE OR REPLACE FUNCTION public.battleship_create(p_stake numeric, p_private boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_cfg   public.battleship_config%ROWTYPE;
  v_gate  text;
  v_bal   numeric;
  v_last  timestamptz;
  v_code  text;
  v_id    uuid;
  v_price numeric;
  v_tung  numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_gate := public._casino_games_gate(v_uid);
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_gate);
  END IF;

  SELECT * INTO v_cfg FROM public.battleship_config WHERE id = 1;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Batalla Naval esta cerrada temporalmente');
  END IF;

  -- p_stake = USD
  IF p_stake IS NULL OR p_stake <> round(p_stake, 2) OR p_stake < v_cfg.min_stake OR p_stake > v_cfg.max_stake THEN
    RETURN jsonb_build_object('success', false, 'error',
      'La apuesta debe estar entre ' || v_cfg.min_stake || ' y ' || v_cfg.max_stake || ' USD (maximo 2 decimales)');
  END IF;

  v_price := public.get_live_tung_price_usd();
  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio de TUNG no disponible. Intentalo en un minuto.');
  END IF;
  v_tung := ceil(p_stake / v_price * 100) / 100;
  IF v_tung <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apuesta invalida');
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_bal FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  IF public._bs_active_match(v_uid) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una partida en curso');
  END IF;

  SELECT max(created_at) INTO v_last FROM public.battleship_matches WHERE player1 = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '5 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Espera unos segundos antes de crear otra sala');
  END IF;

  IF v_bal < v_tung THEN
    RETURN jsonb_build_object('success', false, 'error',
      'TUNG insuficiente. Necesitas ' || v_tung || ' TUNG (' || p_stake || ' USD), tienes ' || round(v_bal, 2) || '.');
  END IF;

  IF COALESCE(p_private, false) THEN
    v_code := public._bs_gen_code();
  END IF;

  PERFORM public._internal_set_fxu_context();
  UPDATE public.profiles SET fxu_balance = fxu_balance - v_tung WHERE id = v_uid;

  INSERT INTO public.battleship_matches (status, is_private, join_code, stake, stake_usd, tung_price, player1, deadline, p1_seen_at)
  VALUES ('waiting', COALESCE(p_private, false), v_code, v_tung, p_stake, v_price, v_uid, now() + interval '15 minutes', now())
  RETURNING id INTO v_id;

  INSERT INTO public.battleship_entries (match_id, user_id, stake) VALUES (v_id, v_uid, v_tung);

  RETURN jsonb_build_object('success', true, 'match_id', v_id, 'code', v_code, 'stake', v_tung, 'stake_usd', p_stake);
END;
$$;
REVOKE ALL ON FUNCTION public.battleship_create(numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_create(numeric, boolean) TO authenticated;

-- Lobby y estado: exponer stake_usd y precio vivo (parche por ancla, una linea cada uno)
DO $patch$
DECLARE
  v_src text;
  v_new text;
  r     record;
BEGIN
  SELECT replace(pg_get_functiondef('public.battleship_lobby()'::regprocedure), chr(13), '') INTO v_src;
  v_new := v_src;
  FOR r IN SELECT * FROM (VALUES
    ($a$'max_stake', v_cfg.max_stake,$a$, $b$'max_stake', v_cfg.max_stake, 'tung_price', public.get_live_tung_price_usd(),$b$),
    ($a$'stake', r.stake, 'created_at'$a$, $b$'stake', r.stake, 'stake_usd', r.stake_usd, 'created_at'$b$),
    ($a$SELECT m.id, p.username, m.stake, m.created_at$a$, $b$SELECT m.id, p.username, m.stake, m.stake_usd, m.created_at$b$),
    ($a$'stake', h.stake, 'pot'$a$, $b$'stake', h.stake, 'stake_usd', h.stake_usd, 'pot'$b$),
    ($a$op.username AS opponent, m.stake, m.pot$a$, $b$op.username AS opponent, m.stake, m.stake_usd, m.pot$b$)
  ) AS t(f, rep) LOOP
    IF position(r.f IN v_new) = 0 THEN
      RAISE EXCEPTION 'ancla lobby no encontrada: %', r.f;
    END IF;
    v_new := replace(v_new, r.f, r.rep);
  END LOOP;
  EXECUTE v_new;

  SELECT replace(pg_get_functiondef('public.battleship_state(uuid)'::regprocedure), chr(13), '') INTO v_src;
  IF position($a$'stake', m.stake,$a$ IN v_src) = 0 THEN
    RAISE EXCEPTION 'ancla state no encontrada';
  END IF;
  EXECUTE replace(v_src, $a$'stake', m.stake,$a$, $b$'stake', m.stake, 'stake_usd', m.stake_usd,$b$);
END;
$patch$;

REVOKE ALL ON FUNCTION public.battleship_lobby() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_lobby() TO authenticated;
REVOKE ALL ON FUNCTION public.battleship_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battleship_state(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
