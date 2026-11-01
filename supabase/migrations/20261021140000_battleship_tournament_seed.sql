-- =====================================================================
-- [BSTSEED] Premio inicial opcional en torneos de Batalla de Naves
--  * El creador (admin u organizador) puede aportar un premio inicial de su saldo.
--  * Se suma íntegro a la bolsa (sin comisión): bolsa = seed + inscripciones netas.
--  * Las comisiones (empresa / organizador) siguen calculándose solo sobre inscripciones.
--  * Si el torneo se cancela (manual o por mínimo no alcanzado) se devuelve al creador.
-- =====================================================================

ALTER TABLE public.battleship_tournaments
  ADD COLUMN seed_prize numeric NOT NULL DEFAULT 0 CHECK (seed_prize >= 0);

-- ---------------------------------------------------------------------
-- 1) _bst_prizes con premio inicial
-- [total inscripciones, empresa, organizador, bolsa, 1o, 2o, 3o]
-- ---------------------------------------------------------------------
DROP FUNCTION public._bst_prizes(numeric, integer, numeric, numeric, integer[]);

CREATE FUNCTION public._bst_prizes(p_fee numeric, p_n integer, p_company numeric, p_creator numeric, p_split integer[], p_seed numeric)
 RETURNS numeric[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_comp  numeric;
  v_cre   numeric;
  v_pool  numeric;
  v2      numeric;
  v3      numeric;
BEGIN
  v_total := p_fee * p_n;
  v_comp  := round(p_fee * p_company / 100, 2) * p_n;
  v_cre   := round(p_fee * p_creator / 100, 2) * p_n;
  v_pool  := v_total - v_comp - v_cre + COALESCE(p_seed, 0);
  v2      := floor(v_pool * p_split[2]) / 100;
  v3      := floor(v_pool * p_split[3]) / 100;
  RETURN ARRAY[v_total, v_comp, v_cre, v_pool, v_pool - v2 - v3, v2, v3];
END;
$function$;
REVOKE ALL ON FUNCTION public._bst_prizes(numeric, integer, numeric, numeric, integer[], numeric) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Parches con ancla exacta y única
-- ---------------------------------------------------------------------
CREATE FUNCTION pg_temp.bst_patch(p_fn text, p_old text, p_new text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_src text;
  v_cnt integer;
BEGIN
  v_src := replace(pg_get_functiondef(p_fn::regprocedure), E'\r', '');
  v_cnt := (length(v_src) - length(replace(v_src, p_old, ''))) / length(p_old);
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Ancla encontrada % veces en %', v_cnt, p_fn;
  END IF;
  EXECUTE replace(v_src, p_old, p_new);
END;
$function$;

-- 2.1 Anuncio: usa el premio inicial y lo destaca
SELECT pg_temp.bst_patch('public._bst_announce(uuid)',
$a$public._bst_prizes(t.entry_fee, t.max_players, t.company_pct, t.creator_pct, t.prize_split)$a$,
$b$public._bst_prizes(t.entry_fee, t.max_players, t.company_pct, t.creator_pct, t.prize_split, t.seed_prize)$b$);
SELECT pg_temp.bst_patch('public._bst_announce(uuid)',
$a$         || '💰 PREMIOS CON EL CUPO LLENO' || nl$a$,
$b$         || CASE WHEN t.seed_prize > 0 THEN
              '🎁 Premio inicial garantizado: ' || public._tgn_fmt(t.seed_prize) || ' TUNG' || public._tgn_usdt(t.seed_prize, v_price) || nl
              || '📈 ¡La bolsa crece con cada inscrito!' || nl || nl
            ELSE '' END
         || '💰 PREMIOS CON EL CUPO LLENO' || nl$b$);

-- 2.2 Arranque: la bolsa incluye el premio inicial
SELECT pg_temp.bst_patch('public._bst_start(uuid)',
$a$public._bst_prizes(t.entry_fee, v_n, t.company_pct, t.creator_pct, t.prize_split)$a$,
$b$public._bst_prizes(t.entry_fee, v_n, t.company_pct, t.creator_pct, t.prize_split, t.seed_prize)$b$);

-- 2.3 JSON público
SELECT pg_temp.bst_patch('public._bst_json(uuid,uuid,boolean)',
$a$public._bst_prizes(t.entry_fee, t.max_players, t.company_pct, t.creator_pct, t.prize_split)$a$,
$b$public._bst_prizes(t.entry_fee, t.max_players, t.company_pct, t.creator_pct, t.prize_split, t.seed_prize)$b$);
SELECT pg_temp.bst_patch('public._bst_json(uuid,uuid,boolean)',
$a$public._bst_prizes(t.entry_fee, t.players, t.company_pct, t.creator_pct, t.prize_split)$a$,
$b$public._bst_prizes(t.entry_fee, t.players, t.company_pct, t.creator_pct, t.prize_split, t.seed_prize)$b$);
SELECT pg_temp.bst_patch('public._bst_json(uuid,uuid,boolean)',
$a$    'entry_fee', t.entry_fee,$a$,
$b$    'entry_fee', t.entry_fee,
    'seed_prize', t.seed_prize,$b$);

-- 2.4 Cancelación: devuelve el premio inicial al creador (una sola vez: solo si sigue 'open')
SELECT pg_temp.bst_patch('public._bst_refund_all(uuid,text)',
$a$  END LOOP;
  UPDATE public.battleship_tournaments
     SET status = 'cancelled'$a$,
$b$  END LOOP;
  -- [BSTSEED] premio inicial de vuelta al creador
  FOR e IN
    SELECT creator_id AS user_id, seed_prize AS paid FROM public.battleship_tournaments
     WHERE id = p_tid AND status = 'open' AND seed_prize > 0 AND creator_id IS NOT NULL
  LOOP
    UPDATE public.profiles SET fxu_balance = fxu_balance + e.paid WHERE id = e.user_id;
    PERFORM public._bst_notify(e.user_id, '↩️ Premio inicial devuelto · ' || v_name,
      '⚓ El torneo «' || v_name || '» se canceló: ' || p_reason || '.' || nl
      || '🎁 Te devolvimos ' || public._tgn_fmt(e.paid) || ' TUNG del premio inicial.', true);
  END LOOP;
  UPDATE public.battleship_tournaments
     SET status = 'cancelled'$b$);

-- ---------------------------------------------------------------------
-- 3) battleship_tournament_create con p_seed_prize (opcional, por defecto 0)
-- ---------------------------------------------------------------------
DROP FUNCTION public.battleship_tournament_create(text, numeric, integer, timestamptz, integer[], text);

CREATE FUNCTION public.battleship_tournament_create(
  p_name text, p_entry_fee numeric, p_max_players integer, p_starts_at timestamptz,
  p_prize_split integer[] DEFAULT ARRAY[50, 30, 20], p_description text DEFAULT NULL,
  p_seed_prize numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_min_fee constant numeric := 1;
  v_uid     uuid := auth.uid();
  v_admin   boolean;
  v_banned  boolean;
  v_enabled boolean;
  v_name    text;
  v_desc    text;
  v_max_fee numeric;
  v_seed    numeric := COALESCE(p_seed_prize, 0);
  v_bal     numeric;
  v_id      uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(is_admin, false), COALESCE(is_banned, false) INTO v_admin, v_banned FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_banned THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cuenta no habilitada');
  END IF;
  SELECT enabled INTO v_enabled FROM public.battleship_config WHERE id = 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La Batalla de Naves esta cerrada temporalmente');
  END IF;

  v_name := btrim(regexp_replace(regexp_replace(COALESCE(p_name, ''), '[<>&|[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'));
  IF char_length(v_name) < 3 OR char_length(v_name) > 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El nombre debe tener entre 3 y 40 caracteres');
  END IF;
  v_desc := NULLIF(btrim(regexp_replace(regexp_replace(COALESCE(p_description, ''), '[<>&|[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), '');
  IF v_desc IS NOT NULL AND char_length(v_desc) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La descripcion admite como maximo 200 caracteres');
  END IF;

  v_max_fee := CASE WHEN v_admin THEN 1000000 ELSE 100000 END;
  IF p_entry_fee IS NULL OR p_entry_fee <> round(p_entry_fee, 2) OR p_entry_fee < c_min_fee OR p_entry_fee > v_max_fee THEN
    RETURN jsonb_build_object('success', false, 'error',
      'La inscripcion debe estar entre ' || c_min_fee || ' y ' || v_max_fee || ' TUNG (maximo 2 decimales)');
  END IF;
  IF v_seed < 0 OR v_seed <> round(v_seed, 2) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Premio inicial invalido (0 o mas, maximo 2 decimales)');
  END IF;
  IF p_max_players IS NULL OR p_max_players NOT IN (4, 8, 16, 32, 64) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plazas invalidas (4, 8, 16, 32 o 64)');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at < now() + interval '5 minutes' OR p_starts_at > now() + interval '30 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El inicio debe ser entre 5 minutos y 30 dias desde ahora');
  END IF;
  IF p_prize_split IS NULL OR cardinality(p_prize_split) <> 3
     OR p_prize_split[1] IS NULL OR p_prize_split[2] IS NULL OR p_prize_split[3] IS NULL
     OR p_prize_split[3] < 5 OR p_prize_split[2] < p_prize_split[3] OR p_prize_split[1] < p_prize_split[2]
     OR p_prize_split[1] + p_prize_split[2] + p_prize_split[3] <> 100 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Reparto invalido: debe sumar 100%, cada puesto minimo 5% y 1o >= 2o >= 3o');
  END IF;

  IF NOT v_admin THEN
    PERFORM pg_advisory_xact_lock(hashtext('bst_create_' || v_uid::text));
    IF EXISTS (SELECT 1 FROM public.battleship_tournaments
                WHERE creator_id = v_uid AND status IN ('open', 'running')) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un torneo activo. Espera a que termine para crear otro.');
    END IF;
    IF EXISTS (SELECT 1 FROM public.battleship_tournaments
                WHERE creator_id = v_uid AND created_at > now() - interval '10 minutes') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Espera unos minutos antes de crear otro torneo');
    END IF;
    IF (SELECT count(*) FROM public.battleship_tournaments WHERE NOT is_official AND status = 'open') >= 20 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Hay demasiados torneos abiertos. Intentalo mas tarde.');
    END IF;
  END IF;

  -- [BSTSEED] El premio inicial sale del saldo del creador
  IF v_seed > 0 THEN
    SELECT COALESCE(fxu_balance, 0) INTO v_bal FROM public.profiles WHERE id = v_uid FOR UPDATE;
    IF v_bal < v_seed THEN
      RETURN jsonb_build_object('success', false, 'error',
        'TUNG insuficiente para el premio inicial. Necesitas ' || v_seed || ' TUNG y tienes ' || round(v_bal, 2) || '.');
    END IF;
  END IF;

  INSERT INTO public.battleship_tournaments (name, description, creator_id, is_official, entry_fee, company_pct,
                                             creator_pct, prize_split, max_players, starts_at, seed_prize)
  VALUES (v_name, v_desc, v_uid, v_admin, p_entry_fee, 20, CASE WHEN v_admin THEN 0 ELSE 10 END,
          p_prize_split, p_max_players, p_starts_at, v_seed)
  RETURNING id INTO v_id;

  IF v_seed > 0 THEN
    PERFORM public._internal_set_fxu_context();
    UPDATE public.profiles SET fxu_balance = fxu_balance - v_seed WHERE id = v_uid;
  END IF;

  PERFORM public._bst_announce(v_id);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.battleship_tournament_create(text, numeric, integer, timestamptz, integer[], text, numeric) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.battleship_tournament_create(text, numeric, integer, timestamptz, integer[], text, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
